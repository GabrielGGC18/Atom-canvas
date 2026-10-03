"""Testes do backend: python -m unittest discover -s tests -v

Usa um diretório de dados temporário (ATOM_CANVAS_DATA) para nunca tocar no
layout.json real do usuário. Os testes de terminal abrem um shell de verdade.
"""
import asyncio
import json
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ["ATOM_CANVAS_DATA"] = _TMP.name
os.environ["ATOM_CANVAS_TOKEN"] = "test-token"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiohttp.test_utils import AioHTTPTestCase  # noqa: E402

import server  # noqa: E402

T = "token=test-token"


class ServerTest(AioHTTPTestCase):
    async def get_application(self):
        return server.create_app()

    async def asyncTearDown(self):
        for sid in list(server.SESSIONS):
            server.kill_session(sid)
        await super().asyncTearDown()

    # ---------- auth ----------
    async def test_rejects_missing_or_wrong_token(self):
        for q in ("", "?token=errado"):
            r = await self.client.get(f"/api/layout{q}")
            self.assertEqual(r.status, 403)

    async def test_rejects_foreign_origin(self):
        r = await self.client.get(f"/api/layout?{T}", headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)

    async def test_index_and_static_served(self):
        r = await self.client.get("/")
        self.assertEqual(r.status, 200)
        self.assertIn("ATOM Canvas", await r.text())
        r = await self.client.get("/static/app.js")
        self.assertEqual(r.status, 200)
        self.assertEqual(r.headers.get("Cache-Control"), "no-cache")

    # ---------- layout ----------
    async def test_layout_roundtrip_and_normalize(self):
        payload = {"view": {"x": 1, "y": 2, "s": 1}, "nodes": [{"id": "a", "type": "note", "text": "olá ✓"}, "lixo"],
                   "connections": None}
        r = await self.client.put(f"/api/layout?{T}&workspace=proj-1", json=payload)
        self.assertEqual(r.status, 200)
        self.assertEqual((await r.json())["workspace"], "proj-1")
        r = await self.client.get(f"/api/layout?{T}&workspace=proj-1")
        data = await r.json()
        self.assertEqual(data["nodes"], [{"id": "a", "type": "note", "text": "olá ✓"}])
        self.assertEqual(data["connections"], [])
        self.assertEqual(data["view"], {"x": 1, "y": 2, "s": 1})

    async def test_unknown_workspace_is_empty_and_not_created(self):
        r = await self.client.get(f"/api/layout?{T}&workspace=nao-existe")
        self.assertEqual(await r.json(), {"nodes": [], "connections": [], "view": None})
        self.assertFalse((server.WORKSPACES / "nao-existe.json").exists())

    async def test_bad_json_rejected(self):
        r = await self.client.put(f"/api/layout?{T}&workspace=x", data="{nope",
                                  headers={"Content-Type": "application/json"})
        self.assertEqual(r.status, 400)
        r = await self.client.put(f"/api/layout?{T}&workspace=x", json=[1, 2])
        self.assertEqual(r.status, 400)

    async def test_corrupt_layout_recovers_with_backup(self):
        path = server._layout_path("quebrado")
        path.write_text("{corrompido", "utf-8")
        r = await self.client.get(f"/api/layout?{T}&workspace=quebrado")
        self.assertEqual(r.status, 200)
        self.assertEqual((await r.json())["nodes"], [])
        self.assertTrue(path.with_name(path.name + ".corrupt").exists())

    async def test_large_layout_accepted(self):
        big = {"nodes": [{"id": "n", "type": "note", "text": "x" * 3_000_000}], "connections": [], "view": None}
        r = await self.client.put(f"/api/layout?{T}&workspace=grande", json=big)
        self.assertEqual(r.status, 200)

    async def test_workspace_name_sanitized(self):
        self.assertEqual(server._workspace_name("../../etc/passwd"), "etcpasswd")
        self.assertEqual(server._workspace_name("  Meu  Projeto. "), "Meu-Projeto")
        self.assertEqual(server._workspace_name("LAYOUT"), "default")
        self.assertEqual(server._workspace_name("..."), "default")
        r = await self.client.put(f"/api/layout?{T}&workspace=a.b c", json={"nodes": []})
        self.assertEqual((await r.json())["workspace"], "ab-c")

    async def test_list_and_delete_workspaces(self):
        await self.client.put(f"/api/layout?{T}&workspace=apagar", json={"nodes": []})
        names = await (await self.client.get(f"/api/workspaces?{T}")).json()
        self.assertEqual(names[0], "default")
        self.assertIn("apagar", names)
        r = await self.client.delete(f"/api/workspaces?{T}&workspace=apagar")
        self.assertEqual(r.status, 200)
        names = await (await self.client.get(f"/api/workspaces?{T}")).json()
        self.assertNotIn("apagar", names)
        r = await self.client.delete(f"/api/workspaces?{T}&workspace=default")
        self.assertEqual(r.status, 400)

    # ---------- terminal ----------
    async def _read_until(self, ws, needle, timeout=20):
        buf = ""
        loop = asyncio.get_running_loop()
        end = loop.time() + timeout
        while needle not in buf:
            left = end - loop.time()
            if left <= 0:
                self.fail(f"timeout esperando {needle!r}; recebido: {buf[-500:]!r}")
            msg = await ws.receive(timeout=left)
            if msg.type.name != "TEXT":
                self.fail(f"ws fechou antes de {needle!r}: {msg.type}")
            m = json.loads(msg.data)
            if m["t"] == "o":
                buf += m["d"]
        return buf

    async def test_terminal_echo_resume_and_kill(self):
        sid = "teste-sessao"
        ws = await self.client.ws_connect(f"/ws/term?{T}&sid={sid}&cols=abc&rows=-5&cwd=Z:/nao/existe")
        hello = json.loads((await ws.receive(timeout=10)).data)
        self.assertEqual(hello["t"], "hello")
        self.assertFalse(hello["resumed"])
        self.assertEqual(hello["cwd"], str(Path.home()))
        await ws.send_str("isto nao e json")          # malformado: ignorado
        await ws.send_str(json.dumps({"t": "r"}))      # sem campos: ignorado
        await ws.send_str(json.dumps({"t": "i", "d": "echo ATOM$((40+2))OK\r" if os.name != "nt" else "echo ('ATOM' + (40+2) + 'OK')\r"}))
        await self._read_until(ws, "ATOM42OK")
        await ws.close()
        self.assertIn(sid, server.SESSIONS)            # shell sobrevive ao fechar a aba

        ws2 = await self.client.ws_connect(f"/ws/term?{T}&sid={sid}")
        hello = json.loads((await ws2.receive(timeout=10)).data)
        self.assertTrue(hello["resumed"])
        await self._read_until(ws2, "ATOM42OK")        # replay da saída anterior
        await ws2.send_str(json.dumps({"t": "kill"}))
        await ws2.receive(timeout=10)
        self.assertNotIn(sid, server.SESSIONS)

    async def test_delete_session_endpoint(self):
        sid = "teste-delete"
        ws = await self.client.ws_connect(f"/ws/term?{T}&sid={sid}")
        await ws.receive(timeout=10)
        self.assertIn(sid, server.SESSIONS)
        r = await self.client.delete(f"/api/session?{T}&sid={sid}")
        self.assertTrue((await r.json())["killed"])
        self.assertNotIn(sid, server.SESSIONS)
        r = await self.client.delete(f"/api/session?{T}&sid={sid}")
        self.assertFalse((await r.json())["killed"])
        await ws.close()

    async def test_health(self):
        r = await self.client.get(f"/api/health?{T}")
        self.assertTrue((await r.json())["ok"])

    async def test_frame_check_reads_headers_without_proxying(self):
        from aiohttp import web
        from aiohttp.test_utils import TestServer

        site = web.Application()
        site.router.add_get("/deny", lambda r: web.Response(text="x", headers={"X-Frame-Options": "DENY"}))
        site.router.add_get("/ok", lambda r: web.Response(text="x"))
        site.router.add_get("/csp", lambda r: web.Response(text="x", headers={
            "Content-Security-Policy": "frame-ancestors 'self'", "X-Frame-Options": "ALLOWALL"}))
        site.router.add_get("/go", lambda r: web.HTTPFound("/deny"))
        srv = TestServer(site)
        await srv.start_server()
        try:
            base = f"http://127.0.0.1:{srv.port}"
            for path, expected in (("/deny", False), ("/ok", True), ("/csp", False), ("/go", False)):
                r = await self.client.get(f"/api/frame-check?{T}&url={base}{path}")
                self.assertEqual(r.status, 200)
                self.assertIs((await r.json())["embeddable"], expected, path)
        finally:
            await srv.close()
        r = await self.client.get(f"/api/frame-check?{T}&url=http://127.0.0.1:1/nada")
        self.assertIsNone((await r.json())["embeddable"])  # offline: deixa o iframe tentar
        for bad in ("file:///etc/passwd", "javascript:alert(1)", "", "nada"):
            r = await self.client.get(f"/api/frame-check?{T}&url={bad}")
            self.assertEqual(r.status, 400, bad)
        r = await self.client.get("/api/frame-check?url=https://example.com")
        self.assertEqual(r.status, 403)

    async def test_open_external_only_http(self):
        from unittest import mock
        with mock.patch("webbrowser.open", return_value=True) as wb:
            r = await self.client.post(f"/api/open-external?{T}&url=https://www.midia63.com.br")
            self.assertTrue((await r.json())["ok"])
            wb.assert_called_once_with("https://www.midia63.com.br")
            r = await self.client.post(f"/api/open-external?{T}&url=file:///C:/Windows/system.ini")
            self.assertEqual(r.status, 400)
            r = await self.client.post("/api/open-external?url=https://x.com")
            self.assertEqual(r.status, 403)
            self.assertEqual(wb.call_count, 1)

    async def test_instance_file_written_and_running_detected(self):
        # on_startup grava o arquivo de instância
        self.assertTrue(server.INSTANCE.exists())
        info = json.loads(server.INSTANCE.read_text("utf-8"))
        self.assertEqual(info["token"], "test-token")
        # aponta para a porta real do servidor de teste e confirma detecção
        server.INSTANCE.write_text(json.dumps({"pid": 1, "port": self.client.port, "token": "test-token"}), "utf-8")
        url = await asyncio.get_running_loop().run_in_executor(None, server.find_running)
        self.assertEqual(url, f"http://127.0.0.1:{self.client.port}/?token=test-token")
        # token errado = instância de outra pessoa/velha: ignorada e apagada
        server.INSTANCE.write_text(json.dumps({"pid": 1, "port": self.client.port, "token": "outro"}), "utf-8")
        url = await asyncio.get_running_loop().run_in_executor(None, server.find_running)
        self.assertIsNone(url)
        self.assertFalse(server.INSTANCE.exists())


class UnitTest(unittest.TestCase):
    def test_remember_caps_buffer(self):
        s = server.Session("x", ".", pty=None)
        s.remember("a" * 10 + "\n" + "b" * (server.SCROLLBACK_CHARS + 50))
        self.assertLessEqual(len(s.output), server.SCROLLBACK_CHARS)

    def test_int_clamp(self):
        self.assertEqual(server._int("abc", 7, 2, 10), 7)
        self.assertEqual(server._int("999", 7, 2, 10), 10)
        self.assertEqual(server._int(-3, 7, 2, 10), 2)

    def test_frame_verdict_rules(self):
        from multidict import CIMultiDict as H
        o = "http://127.0.0.1:8765"
        cases = [
            ({"X-Frame-Options": "DENY"}, False),
            ({"X-Frame-Options": "sameorigin"}, False),
            ({}, True),
            ({"Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'"}, False),
            ({"Content-Security-Policy": "frame-ancestors *"}, True),
            # frame-ancestors tem prioridade sobre X-Frame-Options
            ({"Content-Security-Policy": "frame-ancestors 'self' http://127.0.0.1:*", "X-Frame-Options": "DENY"}, True),
            ({"Content-Security-Policy": "frame-ancestors http://127.0.0.1:8765"}, True),
            ({"Content-Security-Policy": "frame-ancestors http://127.0.0.1:9999"}, False),
            ({"Content-Security-Policy": "frame-ancestors https://*.example.com"}, False),
        ]
        for headers, expected in cases:
            self.assertIs(server.frame_verdict(H(headers), o)[0], expected, headers)

    def test_find_running_ignores_missing_garbage_and_dead(self):
        server.INSTANCE.unlink(missing_ok=True)
        self.assertIsNone(server.find_running())
        server.INSTANCE.write_text("lixo", "utf-8")
        self.assertIsNone(server.find_running())
        with socket.socket() as s:  # porta sem ninguém escutando
            s.bind(("127.0.0.1", 0))
            dead = s.getsockname()[1]
        server.INSTANCE.write_text(json.dumps({"pid": 1, "port": dead, "token": "x"}), "utf-8")
        self.assertIsNone(server.find_running())
        self.assertFalse(server.INSTANCE.exists())

    def test_choose_port_falls_back_when_busy(self):
        old_port, old_fixed = server.PORT, server.PORT_FIXED
        busy = socket.socket()
        try:
            busy.bind(("127.0.0.1", 0))
            busy.listen()
            server.PORT, server.PORT_FIXED = busy.getsockname()[1], False
            got = server.choose_port()
            self.assertIsNotNone(got)
            self.assertNotEqual(got, busy.getsockname()[1])
            self.assertEqual(server.PORT, got)
            server.PORT, server.PORT_FIXED = busy.getsockname()[1], True
            self.assertIsNone(server.choose_port())  # porta fixada: não troca
        finally:
            busy.close()
            server.PORT, server.PORT_FIXED = old_port, old_fixed


if __name__ == "__main__":
    unittest.main()
