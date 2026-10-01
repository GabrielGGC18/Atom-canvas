"""ATOM Canvas — canvas infinito com terminais reais (PTY) e notas.
Roda local: python server.py  -> http://127.0.0.1:8765
"""
import asyncio
import json
import os
import re
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path

from aiohttp import web, WSMsgType

BASE = Path(__file__).parent
STATIC = BASE / "static"
LAYOUT = BASE / "layout.json"
WORKSPACES = BASE / "workspaces"
HOST, PORT = "127.0.0.1", int(os.environ.get("ATOM_CANVAS_PORT", 8765))
TOKEN = os.environ.get("ATOM_CANVAS_TOKEN") or secrets.token_urlsafe(16)
def _default_shell():
    if os.name != "nt":
        return os.environ.get("SHELL", "/bin/bash")
    import shutil
    for cand in ("pwsh.exe", "powershell.exe"):
        found = shutil.which(cand)
        if found:
            return found
    root = os.environ.get("SystemRoot", r"C:\Windows")
    return os.path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")


SHELL = os.environ.get("ATOM_SHELL") or _default_shell()


def _workspace_name(value):
    """Return a safe, stable workspace name for a URL/file name."""
    value = (value or "default").strip()
    if value.lower() in ("default", "layout"):
        return "default"
    value = re.sub(r"[^a-zA-Z0-9 _-]+", "", value).strip()
    value = re.sub(r"\s+", "-", value)
    return value[:64] or "default"


def _layout_path(name):
    name = _workspace_name(name)
    if name == "default":
        return LAYOUT
    WORKSPACES.mkdir(exist_ok=True)
    return WORKSPACES / f"{name}.json"


def _empty_layout():
    return {"nodes": [], "connections": [], "view": None}


# ---------- PTY abstraction (Windows: pywinpty / POSIX: pty) ----------
class Pty:
    def __init__(self, cwd, cols=100, rows=30):
        if os.name == "nt":
            from winpty import PtyProcess
            self.proc = PtyProcess.spawn(SHELL, cwd=cwd, dimensions=(rows, cols))
        else:
            import ptyprocess
            self.proc = ptyprocess.PtyProcessUnicode.spawn([SHELL], cwd=cwd, dimensions=(rows, cols))

    def read(self):
        return self.proc.read(4096)

    def write(self, data):
        self.proc.write(data)

    def resize(self, cols, rows):
        self.proc.setwinsize(rows, cols)

    def alive(self):
        return self.proc.isalive()

    def kill(self):
        try:
            self.proc.terminate(force=True)
        except Exception:
            pass


@dataclass
class Session:
    sid: str
    cwd: str
    pty: Pty
    output: str = ""
    ws: object = None
    task: object = None
    cols: int = 100
    rows: int = 30

    def remember(self, data):
        self.output = (self.output + data)[-24000:]


SESSIONS = {}


def check_auth(request):
    if request.query.get("token") != TOKEN:
        raise web.HTTPForbidden(text="token invalido")
    origin = request.headers.get("Origin")
    if origin and origin not in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
        raise web.HTTPForbidden(text="origin bloqueada")


async def ws_term(request):
    check_auth(request)
    cwd = request.query.get("cwd") or str(Path.home())
    if not Path(cwd).is_dir():
        cwd = str(Path.home())
    sid = request.query.get("sid") or secrets.token_urlsafe(12)
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    cols, rows = int(request.query.get("cols", 100)), int(request.query.get("rows", 30))
    loop = asyncio.get_running_loop()

    session = SESSIONS.get(sid)
    if session and not session.pty.alive():
        SESSIONS.pop(sid, None)
        session = None
    if session is None:
        try:
            session = Session(sid, cwd, Pty(cwd, cols, rows), cols=cols, rows=rows)
        except Exception as e:
            await ws.send_str(json.dumps({"t": "o", "d": f"\x1b[31mFalha ao abrir shell: {e}\x1b[0m\r\n"}))
            await ws.close()
            return ws
        SESSIONS[sid] = session

        async def pump(s=session):
            while s.pty.alive():
                data = ""
                try:
                    data = await loop.run_in_executor(None, s.pty.read)
                except Exception:
                    break
                if not data:
                    continue
                s.remember(data)
                if s.ws and not s.ws.closed:
                    try:
                        await s.ws.send_str(json.dumps({"t": "o", "d": data}))
                    except Exception:
                        s.ws = None
            if s.ws and not s.ws.closed:
                try:
                    await s.ws.send_str(json.dumps({"t": "exit"}))
                    await s.ws.close()
                except Exception:
                    pass

        session.task = asyncio.create_task(pump())

    if session.ws and not session.ws.closed and session.ws is not ws:
        await session.ws.close()
    session.ws = ws
    if session.output:
        await ws.send_str(json.dumps({"t": "o", "d": session.output}))
    try:
        session.pty.resize(max(2, cols), max(2, rows))
    except Exception:
        pass
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            m = json.loads(msg.data)
            if m["t"] == "i":
                session.pty.write(m["d"])
            elif m["t"] == "r":
                session.cols, session.rows = max(2, int(m["c"])), max(2, int(m["r"]))
                session.pty.resize(session.cols, session.rows)
    finally:
        if session.ws is ws:
            session.ws = None
    return ws


async def get_layout(request):
    check_auth(request)
    path = _layout_path(request.query.get("workspace"))
    data = json.loads(path.read_text("utf-8")) if path.exists() else _empty_layout()
    data.setdefault("connections", [])
    return web.json_response(data)


async def put_layout(request):
    check_auth(request)
    data = await request.json()
    data.setdefault("connections", [])
    _layout_path(request.query.get("workspace")).write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    return web.json_response({"ok": True})


async def list_workspaces(request):
    check_auth(request)
    names = {"default"}
    if WORKSPACES.exists():
        names.update(p.stem for p in WORKSPACES.glob("*.json"))
    return web.json_response(sorted(names, key=lambda n: (n != "default", n.lower())))


async def index(request):
    return web.FileResponse(STATIC / "index.html")


def main():
    app = create_app()
    url = f"http://{HOST}:{PORT}/?token={TOKEN}"
    print(f"\n  ATOM Canvas -> {url}\n")
    if "--open" in sys.argv:
        import webbrowser
        webbrowser.open(url)
    web.run_app(app, host=HOST, port=PORT, print=None)


def create_app():
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/ws/term", ws_term)
    app.router.add_get("/api/layout", get_layout)
    app.router.add_put("/api/layout", put_layout)
    app.router.add_get("/api/workspaces", list_workspaces)
    app.router.add_static("/static", STATIC)
    return app


if __name__ == "__main__":
    main()
