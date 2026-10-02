"""ATOM Canvas — canvas infinito com terminais reais (PTY) e notas.
Roda local: python server.py  -> http://127.0.0.1:8765
"""
import asyncio
import json
import os
import re
import secrets
import socket
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from aiohttp import web, WSCloseCode, WSMsgType

BASE = Path(__file__).parent
STATIC = BASE / "static"
# Dados do usuário (layout + workspaces). ATOM_CANVAS_DATA permite isolar
# (testes, perfis diferentes) sem tocar no layout.json padrão.
DATA = Path(os.environ.get("ATOM_CANVAS_DATA") or BASE)
LAYOUT = DATA / "layout.json"
WORKSPACES = DATA / "workspaces"
HOST, PORT = "127.0.0.1", int(os.environ.get("ATOM_CANVAS_PORT", 8765))
TOKEN = os.environ.get("ATOM_CANVAS_TOKEN") or secrets.token_urlsafe(16)
MAX_TERMINALS = int(os.environ.get("ATOM_MAX_TERMINALS", 128))
SCROLLBACK_CHARS = 200_000          # saída guardada para replay ao reconectar
MAX_LAYOUT_BYTES = 32 * 1024 * 1024  # notas/markdown grandes cabem no layout

# Cada terminal mantém uma thread bloqueada em pty.read(); o executor padrão do
# asyncio (min(32, cpus+4) threads) travaria novos shells com muitos terminais.
PTY_READERS = ThreadPoolExecutor(max_workers=MAX_TERMINALS, thread_name_prefix="pty")


def _default_shell():
    import shutil
    if os.name != "nt":
        env_shell = os.environ.get("SHELL")
        if env_shell and os.path.exists(env_shell):
            return env_shell
        return shutil.which("bash") or shutil.which("zsh") or "/bin/sh"
    for cand in ("pwsh.exe", "powershell.exe"):
        found = shutil.which(cand)
        if found:
            return found
    root = os.environ.get("SystemRoot", r"C:\Windows")
    return os.path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")


SHELL = os.environ.get("ATOM_SHELL") or _default_shell()


WINDOWS_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(10)), *(f"LPT{i}" for i in range(10))}


def _workspace_name(value):
    """Return a safe, stable workspace name for a URL/file name."""
    value = (value or "default").strip()
    if value.lower() in ("default", "layout"):
        return "default"
    value = re.sub(r"[^a-zA-Z0-9 _-]+", "", value).strip()
    value = re.sub(r"\s+", "-", value)[:64]
    if not value:
        return "default"
    # CON, NUL, COM1... são dispositivos no Windows: "con.json" não é um arquivo
    # comum e gravar nele perde o layout (ou trava). Ganha um sufixo.
    if value.split(".")[0].upper() in WINDOWS_RESERVED:
        value = value[:61] + "-ws"
    return value


def _layout_path(name, create=True):
    name = _workspace_name(name)
    if name == "default":
        return LAYOUT
    if create:
        WORKSPACES.mkdir(parents=True, exist_ok=True)
    return WORKSPACES / f"{name}.json"


def _empty_layout():
    return {"nodes": [], "connections": [], "view": None}


def _atomic_write(path, text):
    """Grava em arquivo temporário e troca de uma vez: queda no meio não corrompe."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_layout(path):
    if not path.exists():
        return _empty_layout()
    try:
        data = json.loads(path.read_text("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("layout não é objeto")
    except (ValueError, UnicodeDecodeError) as e:
        # Não perde o arquivo ruim: guarda cópia e devolve layout vazio.
        backup = path.with_name(path.name + ".corrupt")
        try:
            os.replace(path, backup)
        except OSError:
            pass
        print(f"  [aviso] layout corrompido ({e}); copiado para {backup.name}", file=sys.stderr)
        return _empty_layout()
    return _normalize_layout(data)


def _normalize_layout(data):
    nodes = data.get("nodes")
    conns = data.get("connections")
    view = data.get("view")
    return {
        "nodes": [n for n in nodes if isinstance(n, dict)] if isinstance(nodes, list) else [],
        "connections": [c for c in conns if isinstance(c, dict)] if isinstance(conns, list) else [],
        "view": view if isinstance(view, dict) else None,
    }


def _int(value, default, lo, hi):
    try:
        return min(hi, max(lo, int(value)))
    except (TypeError, ValueError):
        return default


# ---------- PTY abstraction (Windows: pywinpty / POSIX: pty) ----------
class Pty:
    def __init__(self, cwd, cols=100, rows=30):
        if os.name == "nt":
            from winpty import PtyProcess
            self.proc = PtyProcess.spawn(SHELL, cwd=cwd, dimensions=(rows, cols))
        else:
            import ptyprocess
            env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor")
            self.proc = ptyprocess.PtyProcessUnicode.spawn([SHELL], cwd=cwd, env=env, dimensions=(rows, cols))

    def read(self):
        return self.proc.read(4096)

    def write(self, data):
        self.proc.write(data)

    def resize(self, cols, rows):
        self.proc.setwinsize(rows, cols)

    def alive(self):
        try:
            return self.proc.isalive()
        except Exception:
            return False

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
        out = self.output + data
        if len(out) > SCROLLBACK_CHARS:
            out = out[-SCROLLBACK_CHARS:]
            # Corta numa quebra de linha para não começar o replay no meio de
            # uma sequência de escape ANSI.
            nl = out.find("\n")
            if 0 <= nl < 4096:
                out = out[nl + 1:]
        self.output = out


SESSIONS = {}


def kill_session(sid):
    s = SESSIONS.pop(sid, None)
    if s:
        s.pty.kill()
    return s is not None


def check_auth(request):
    if not secrets.compare_digest(request.query.get("token", ""), TOKEN):
        raise web.HTTPForbidden(text="token invalido")
    origin = request.headers.get("Origin")
    if origin and origin not in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
        raise web.HTTPForbidden(text="origin bloqueada")


async def _send(ws, payload):
    if ws is not None and not ws.closed:
        try:
            await ws.send_str(json.dumps(payload))
            return True
        except Exception:
            return False
    return False


async def ws_term(request):
    check_auth(request)
    cwd = request.query.get("cwd") or str(Path.home())
    try:
        if not Path(cwd).expanduser().is_dir():
            cwd = str(Path.home())
        else:
            cwd = str(Path(cwd).expanduser())
    except OSError:
        cwd = str(Path.home())
    sid = (request.query.get("sid") or secrets.token_urlsafe(12))[:128]
    cols = _int(request.query.get("cols"), 100, 2, 1000)
    rows = _int(request.query.get("rows"), 30, 2, 500)
    ws = web.WebSocketResponse(heartbeat=30, max_msg_size=8 * 1024 * 1024)
    await ws.prepare(request)
    loop = asyncio.get_running_loop()

    session = SESSIONS.get(sid)
    if session and not session.pty.alive():
        SESSIONS.pop(sid, None)
        session = None
    resumed = session is not None
    if session is None:
        if len(SESSIONS) >= MAX_TERMINALS:
            await _send(ws, {"t": "o", "d": f"\x1b[31mLimite de {MAX_TERMINALS} terminais atingido.\x1b[0m\r\n"})
            await _send(ws, {"t": "exit"})
            await ws.close()
            return ws
        try:
            # spawn bloqueia ~100ms (ConPTY): fora do event loop.
            pty = await loop.run_in_executor(None, Pty, cwd, cols, rows)
            session = Session(sid, cwd, pty, cols=cols, rows=rows)
            other = SESSIONS.get(sid)
            if other is not None and other.pty.alive():
                # outra conexão com o mesmo sid criou a sessão durante o spawn
                pty.kill()
                session, resumed = other, True
        except Exception as e:
            await _send(ws, {"t": "o", "d": f"\x1b[31mFalha ao abrir shell ({SHELL}): {e}\x1b[0m\r\n"})
            await _send(ws, {"t": "exit"})
            await ws.close()
            return ws

    if not resumed:
        SESSIONS[sid] = session

        async def pump(s=session):
            while s.pty.alive():
                try:
                    data = await loop.run_in_executor(PTY_READERS, s.pty.read)
                except Exception:
                    break
                if not data:
                    await asyncio.sleep(0.01)
                    continue
                s.remember(data)
                if s.ws is not None and not await _send(s.ws, {"t": "o", "d": data}):
                    s.ws = None
            if SESSIONS.get(s.sid) is s:
                SESSIONS.pop(s.sid, None)
            if s.ws is not None:
                await _send(s.ws, {"t": "exit"})
                try:
                    await s.ws.close()
                except Exception:
                    pass

        session.task = asyncio.create_task(pump())

    if session.ws is not None and not session.ws.closed and session.ws is not ws:
        await session.ws.close()
    session.ws = ws
    await _send(ws, {"t": "hello", "resumed": resumed, "cwd": session.cwd, "shell": os.path.basename(SHELL)})
    if session.output:
        await _send(ws, {"t": "o", "d": session.output})
    try:
        session.pty.resize(cols, rows)
    except Exception:
        pass
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                m = json.loads(msg.data)
                kind = m.get("t")
                if kind == "i":
                    data = m.get("d")
                    if isinstance(data, str) and data:
                        session.pty.write(data)
                elif kind == "r":
                    session.cols = _int(m.get("c"), session.cols, 2, 1000)
                    session.rows = _int(m.get("r"), session.rows, 2, 500)
                    session.pty.resize(session.cols, session.rows)
                elif kind == "kill":
                    kill_session(sid)
                    break
            except (ValueError, AttributeError, TypeError):
                continue  # mensagem malformada: ignora em vez de derrubar o terminal
            except Exception:
                if not session.pty.alive():
                    break
    finally:
        if session.ws is ws:
            session.ws = None
    return ws


async def delete_session(request):
    check_auth(request)
    sid = request.query.get("sid", "")
    return web.json_response({"ok": True, "killed": kill_session(sid)})


async def get_layout(request):
    check_auth(request)
    path = _layout_path(request.query.get("workspace"), create=False)
    return web.json_response(_read_layout(path), headers={"Cache-Control": "no-store"})


async def put_layout(request):
    check_auth(request)
    try:
        data = await request.json()
    except (ValueError, RecursionError):  # RecursionError: JSON aninhado demais
        raise web.HTTPBadRequest(text="JSON invalido")
    if not isinstance(data, dict):
        raise web.HTTPBadRequest(text="layout deve ser objeto")
    name = _workspace_name(request.query.get("workspace"))
    text = json.dumps(_normalize_layout(data), ensure_ascii=False, indent=1)
    await asyncio.get_running_loop().run_in_executor(None, _atomic_write, _layout_path(name), text)
    return web.json_response({"ok": True, "workspace": name})


def _workspace_names():
    names = {"default"}
    if WORKSPACES.exists():
        names.update(p.stem for p in WORKSPACES.glob("*.json"))
    return sorted(names, key=lambda n: (n != "default", n.lower()))


def _workspace_info(name):
    path = _layout_path(name, create=False)
    layout = _read_layout(path)
    sids = [n.get("sessionId") for n in layout["nodes"] if n.get("type") == "term"]
    try:
        updated = path.stat().st_mtime
    except OSError:
        updated = None
    return {
        "name": name,
        "windows": len(layout["nodes"]),
        "terminals": len(sids),
        # shells que seguem rodando no servidor (inclusive em segundo plano)
        "running": sum(1 for sid in sids if isinstance(sid, str) and sid in SESSIONS),
        "updated": updated,
    }


async def list_workspaces(request):
    check_auth(request)
    names = _workspace_names()
    if request.query.get("details") == "1":
        infos = await asyncio.get_running_loop().run_in_executor(None, lambda: [_workspace_info(n) for n in names])
        return web.json_response(infos, headers={"Cache-Control": "no-store"})
    return web.json_response(names)


def _target_name(request):
    src = _workspace_name(request.query.get("workspace"))
    raw = request.query.get("to", "")
    dst = _workspace_name(raw)
    if not raw.strip() or dst == "default":
        raise web.HTTPBadRequest(text="nome de destino invalido")
    if dst == src:
        raise web.HTTPBadRequest(text="destino igual a origem")
    if _layout_path(dst, create=False).exists():
        raise web.HTTPConflict(text="ja existe um workspace com esse nome")
    return src, dst


async def rename_workspace(request):
    check_auth(request)
    src, dst = _target_name(request)
    if src == "default":
        raise web.HTTPBadRequest(text="workspace default nao pode ser renomeado")
    path = _layout_path(src, create=False)
    if not path.exists():
        raise web.HTTPNotFound(text="workspace nao existe")
    os.replace(path, _layout_path(dst))
    return web.json_response({"ok": True, "workspace": dst})


async def duplicate_workspace(request):
    check_auth(request)
    src, dst = _target_name(request)
    layout = _read_layout(_layout_path(src, create=False))
    for node in layout["nodes"]:
        # a cópia abre shells novos em vez de dividir os mesmos processos
        node.pop("sessionId", None)
    text = json.dumps(layout, ensure_ascii=False, indent=1)
    await asyncio.get_running_loop().run_in_executor(None, _atomic_write, _layout_path(dst), text)
    return web.json_response({"ok": True, "workspace": dst})


async def delete_workspace(request):
    check_auth(request)
    name = _workspace_name(request.query.get("workspace"))
    if name == "default":
        raise web.HTTPBadRequest(text="workspace default nao pode ser excluido")
    path = _layout_path(name, create=False)
    killed = 0
    if path.exists():
        # encerra os shells do workspace: senão viram processos órfãos
        for n in _read_layout(path)["nodes"]:
            sid = n.get("sessionId")
            if isinstance(sid, str) and kill_session(sid):
                killed += 1
        path.unlink()
    return web.json_response({"ok": True, "workspace": name, "killed": killed})


async def health(request):
    check_auth(request)
    return web.json_response({"ok": True, "sessions": len(SESSIONS), "shell": os.path.basename(SHELL)})


async def index(request):
    return web.FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src * data: blob:; frame-src http: https: data: blob:; "
    f"connect-src 'self' ws://127.0.0.1:{PORT} ws://localhost:{PORT}; "
    "font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)


@web.middleware
async def security(request, handler):
    # Host fora da lista = possível DNS rebinding (site malicioso apontando
    # seu domínio para 127.0.0.1). O token já barra a API; isto fecha o resto.
    if request.host.rsplit(":", 1)[0].lower() not in ALLOWED_HOSTS:
        raise web.HTTPMisdirectedRequest(text="host nao permitido")
    resp = await handler(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path == "/" or request.path.endswith(".html"):
        resp.headers.setdefault("Content-Security-Policy", CSP)
        resp.headers.setdefault("X-Frame-Options", "DENY")
    return resp


@web.middleware
async def no_cache_static(request, handler):
    # Sem isso o navegador/pywebview segue usando app.js antigo após git pull.
    resp = await handler(request)
    if request.path.startswith("/static/") and not request.path.startswith("/static/vendor/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def port_free(host=None, port=None):
    """True se dá para escutar em host:port (detecta outra instância rodando)."""
    host, port = host or HOST, port or PORT
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        # Sem SO_REUSEADDR o bind falha com conexões em TIME_WAIT de uma instância
        # recém-fechada (falso "porta ocupada"). O aiohttp usa SO_REUSEADDR em
        # POSIX; no Windows a flag permitiria roubar porta em LISTEN.
        if os.name != "nt":
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
        except OSError:
            return False
    return True


def wait_listening(alive=lambda: True, timeout=15.0):
    """Espera o servidor aceitar conexões; False se `alive()` cair ou estourar o tempo."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not alive():
            return False
        try:
            socket.create_connection((HOST, PORT), timeout=0.2).close()
            return True
        except OSError:
            time.sleep(0.05)
    return False


def main():
    if not port_free():
        # Antes o navegador abria com o TOKEN novo apontando para a instância
        # antiga (outro token) -> "Token inválido" e o canvas não carregava.
        sys.exit(
            f"\n  Porta {PORT} ocupada (outra instância do ATOM Canvas já está aberta?).\n"
            f"  Feche a janela dela ou use outra porta: set ATOM_CANVAS_PORT=8766\n"
        )
    if len(TOKEN) < 16:
        print("  [aviso] ATOM_CANVAS_TOKEN curto: qualquer programa local pode adivinhá-lo. Use 16+ caracteres.", file=sys.stderr)
    app = create_app()
    url = f"http://{HOST}:{PORT}/?token={TOKEN}"
    print(f"\n  ATOM Canvas -> {url}\n  (Ctrl+C para encerrar)\n", flush=True)
    if "--open" in sys.argv:
        # Abre o navegador só quando o servidor já escuta (antes abria cedo
        # demais e mostrava "não foi possível conectar").
        def _open():
            if wait_listening():
                import webbrowser
                webbrowser.open(url)
        threading.Thread(target=_open, daemon=True).start()
    try:
        web.run_app(app, host=HOST, port=PORT, print=None)
    finally:
        PTY_READERS.shutdown(wait=False, cancel_futures=True)


def create_app():
    app = web.Application(client_max_size=MAX_LAYOUT_BYTES, middlewares=[security, no_cache_static])
    app.router.add_get("/", index)
    app.router.add_get("/ws/term", ws_term)
    app.router.add_delete("/api/session", delete_session)
    app.router.add_get("/api/layout", get_layout)
    app.router.add_put("/api/layout", put_layout)
    app.router.add_get("/api/workspaces", list_workspaces)
    app.router.add_delete("/api/workspaces", delete_workspace)
    app.router.add_post("/api/workspaces/rename", rename_workspace)
    app.router.add_post("/api/workspaces/duplicate", duplicate_workspace)
    app.router.add_get("/api/health", health)
    app.router.add_static("/static", STATIC)
    app.on_shutdown.append(_kill_sessions)
    return app


async def _kill_sessions(app):
    """Encerra todos os shells ao parar o servidor (libera threads de leitura)."""
    for s in list(SESSIONS.values()):
        # Desliga o WebSocket antes de matar o shell: senão o pump avisa "exit" e
        # o navegador trata como processo encerrado, sem reconectar quando o
        # servidor voltar. Fechar com 1001 (going away) leva à reconexão.
        ws, s.ws = s.ws, None
        s.pty.kill()
        if ws is not None and not ws.closed:
            try:
                await ws.close(code=WSCloseCode.GOING_AWAY, message=b"server shutdown")
            except Exception:
                pass
    SESSIONS.clear()


if __name__ == "__main__":
    main()
