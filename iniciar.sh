#!/usr/bin/env bash
# ATOM Canvas — launcher Linux/macOS.
# Cria .venv na primeira execução, instala dependências e abre o navegador.
#   ./iniciar.sh            -> navegador
#   ./iniciar.sh --desktop  -> janela desktop (pywebview)
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Python 3 não encontrado. Instale: sudo apt install python3 python3-venv" >&2
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "Criando ambiente virtual (.venv)..."
  "$PY" -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

if [ "${1:-}" = "--desktop" ]; then
  shift
  .venv/bin/python -c "import webview" 2>/dev/null || .venv/bin/pip install -q "pywebview[gtk]"
  exec .venv/bin/python desktop.py "$@"
fi

exec .venv/bin/python server.py --open "$@"
