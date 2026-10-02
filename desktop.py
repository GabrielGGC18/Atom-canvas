"""Optional desktop launcher for ATOM Canvas.

Install the normal requirements plus pywebview, then run:
    python desktop.py
"""
import threading

from server import HOST, PORT, TOKEN, create_app, port_free, wait_listening


def main():
    try:
        import webview
    except ImportError as exc:
        raise SystemExit("Modo desktop requer pywebview: pip install pywebview") from exc

    from aiohttp import web

    if not port_free():
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
    if not wait_listening(thread.is_alive, timeout=10.0):
        raise SystemExit(f"Servidor não subiu em {HOST}:{PORT}. Veja o erro acima.")
    webview.create_window("ATOM Canvas", f"http://{HOST}:{PORT}/?token={TOKEN}", width=1440, height=900)
    webview.start()


if __name__ == "__main__":
    main()
