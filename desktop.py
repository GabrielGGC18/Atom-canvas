"""Optional desktop launcher for ATOM Canvas.

Install the normal requirements plus pywebview, then run:
    python desktop.py

Se já houver uma instância do ATOM Canvas usando esta pasta de dados (aberta
pelo navegador ou outra janela desktop), a janela abre nela em vez de subir um
segundo servidor que disputaria a porta e o mesmo layout.json.
"""
import threading

import server


def main():
    try:
        import webview
    except ImportError as exc:
        raise SystemExit("Modo desktop requer pywebview: pip install pywebview") from exc

    from aiohttp import web

    url = server.find_running()
    if url is None:
        requested = server.PORT
        if server.choose_port() is None:
            raise SystemExit(
                f"Porta {requested} ocupada por outro programa. "
                f"Feche-o ou use ATOM_CANVAS_PORT=<outra porta>."
            )
        if server.PORT != requested:
            print(f"  [aviso] porta {requested} ocupada; usando {server.PORT}.", flush=True)
        thread = threading.Thread(
            target=web.run_app,
            args=(server.create_app(),),
            kwargs={"host": server.HOST, "port": server.PORT, "print": None, "handle_signals": False},
            daemon=True,
        )
        thread.start()
        if not server.wait_listening(thread.is_alive, timeout=10.0):
            raise SystemExit(f"Servidor não subiu em {server.HOST}:{server.PORT}. Veja o erro acima.")
        url = server.url_for()
    else:
        print(f"  ATOM Canvas já está rodando; abrindo janela em {url}", flush=True)
    own = server.url_for() == url
    webview.create_window("ATOM Canvas", url, width=1440, height=900, min_size=(800, 500))
    webview.start()
    if own:
        # Thread daemon morre sem rodar on_cleanup: remove o arquivo de instância aqui.
        import asyncio
        asyncio.run(server._remove_instance(None))


if __name__ == "__main__":
    main()
