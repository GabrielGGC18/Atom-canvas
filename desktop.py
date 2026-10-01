"""Optional desktop launcher for ATOM Canvas.

Install the normal requirements plus pywebview, then run:
    python desktop.py
"""
import socket
import threading
import time

from server import HOST, PORT, TOKEN, create_app


def _port_free():
    # Correção: antes, com a porta ocupada (outra instância rodando), a thread do
    # servidor morria em silêncio e a janela abria apontando pro servidor antigo,
    # que tem outro TOKEN -> todo WebSocket/API levava 403 e nada abria.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((HOST, PORT))
        except OSError:
            return False
    return True


def _wait_server(thread, timeout=10.0):
    # Correção: substitui o time.sleep(0.35) fixo. Espera o servidor aceitar
    # conexão de fato; se a thread morrer antes, avisa em vez de abrir janela vazia.
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not thread.is_alive():
            return False
        try:
            socket.create_connection((HOST, PORT), timeout=0.2).close()
            return True
        except OSError:
            time.sleep(0.05)
    return False


def main():
    try:
        import webview
    except ImportError as exc:
        raise SystemExit("Modo desktop requer pywebview: pip install pywebview") from exc

    from aiohttp import web

    if not _port_free():
        raise SystemExit(
            f"Porta {PORT} ocupada (outra instância do ATOM Canvas?). "
            f"Feche-a ou use ATOM_CANVAS_PORT=<outra porta>."
        )

    thread = threading.Thread(
        target=web.run_app,
        args=(create_app(),),
        kwargs={"host": HOST, "port": PORT, "print": None, "handle_signals": False},
        daemon=True,
    )
    thread.start()
    if not _wait_server(thread):
        raise SystemExit(f"Servidor não subiu em {HOST}:{PORT}. Veja o erro acima.")
    webview.create_window("ATOM Canvas", f"http://{HOST}:{PORT}/?token={TOKEN}", width=1440, height=900)
    webview.start()


if __name__ == "__main__":
    main()
