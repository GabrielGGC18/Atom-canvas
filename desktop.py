"""Optional desktop launcher for ATOM Canvas.

Install the normal requirements plus pywebview, then run:
    python desktop.py
"""
import threading
import time

from server import HOST, PORT, TOKEN, create_app


def main():
    try:
        import webview
    except ImportError as exc:
        raise SystemExit("Modo desktop requer pywebview: pip install pywebview") from exc

    from aiohttp import web

    thread = threading.Thread(
        target=web.run_app,
        args=(create_app(),),
        kwargs={"host": HOST, "port": PORT, "print": None, "handle_signals": False},
        daemon=True,
    )
    thread.start()
    time.sleep(0.35)
    webview.create_window("ATOM Canvas", f"http://{HOST}:{PORT}/?token={TOKEN}", width=1440, height=900)
    webview.start()


if __name__ == "__main__":
    main()
