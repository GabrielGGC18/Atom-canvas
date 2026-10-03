# ATOM Canvas

Canvas infinito local com **terminais reais**, notas e janelas de Markdown, imagem e navegador — tudo lado a lado, arrastável e com zoom. Feito em **Python (aiohttp + PTY)** no backend e **HTML/CSS/JS puro** no frontend, sem build.

> Inspirado em ferramentas de "canvas de agentes": abra vários terminais (ex.: um `claude` por pasta) e organize tudo visualmente.

## Recursos

- Terminais PowerShell/bash reais via PTY (pywinpty no Windows, ptyprocess no Linux/macOS) com xterm.js
- Sessões persistentes: o shell sobrevive ao recarregar a página; reconexão automática se o servidor cair
- Fechar janela com **Desfazer** (o shell só é encerrado após alguns segundos — sem processos órfãos)
- Canvas infinito: pan, zoom, ajustar tudo, encaixe na grade, minimap
- Janelas: mover, redimensionar, minimizar, maximizar, tela cheia, duplicar, cor por janela, renomear
- Notas, preview de Markdown, imagem e navegador (iframe). Sites que proíbem ser embutidos (`X-Frame-Options` / CSP `frame-ancestors`) mostram um aviso com "Abrir no navegador" — a proteção do site é respeitada, sem proxy
- Conexões (linhas) entre janelas
- Botão para rodar `claude` (Claude Code) na pasta do terminal
- Busca embutida no terminal (`Ctrl+Shift+F`, com contador de resultados) e links clicáveis
- Workspaces: vários canvases salvos em disco (criar, trocar, excluir); gravação atômica do layout
- Markdown com títulos, listas, checklists, citações, blocos de código e links
- Diálogos próprios (sem `prompt()` do navegador), notificações e indicador de "salvo / salvando / erro"
- Modo desktop opcional com pywebview

## Requisitos

- Python 3.10+
- **Windows 10/11** (PowerShell via ConPTY/pywinpty) ou **Linux / macOS** (bash/zsh via ptyprocess)
- Navegador moderno (Chrome, Edge, Firefox)

Documentação técnica completa: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · versão visual [`docs/arquitetura.html`](docs/arquitetura.html).

## Instalação e uso

### Linux / macOS

```bash
git clone https://github.com/GabrielGGC18/Atom-canvas.git
cd Atom-canvas
chmod +x iniciar.sh      # só se o bit de execução se perder
./iniciar.sh             # cria .venv, instala dependências e abre o navegador
```

Pré-requisitos no Debian/Ubuntu: `sudo apt install python3 python3-venv`.

Manual:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py --open
```

O shell aberto é o `$SHELL` do usuário (fallback: `bash` → `zsh` → `/bin/sh`), com `TERM=xterm-256color`.

**Modo desktop no Linux (opcional):** `./iniciar.sh --desktop`. Requer GTK/WebKit do sistema:
`sudo apt install python3-gi gir1.2-webkit2-4.1` (ou equivalente da sua distro).

### Windows

Duplo clique em `iniciar.bat` (navegador) ou `iniciar-desktop.bat` (janela desktop via pywebview). Na primeira execução ele cria `.venv` e instala as dependências sozinho — o Python é encontrado mesmo fora do PATH (Python Launcher ou pastas padrão do instalador); se algo der errado, a janela fica aberta mostrando o erro. Manual:

```powershell
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py --open
```

### Acesso

O servidor imprime `http://127.0.0.1:8765/?token=...` e abre o navegador (`--open`). O token muda a cada execução. `Ctrl+C` para o servidor e encerra todos os shells.

**Uma instância por pasta de dados:** o servidor ativo grava `.atom-canvas.json` (porta + token, ignorado no git). Abrir de novo — pelo navegador ou pelo modo desktop — reaproveita a instância que já está rodando em vez de subir outra que disputaria a porta e o mesmo `layout.json`. Se a porta 8765 estiver ocupada por outro programa, o ATOM usa a próxima livre (a menos que `ATOM_CANVAS_PORT` tenha sido definida).

### Variáveis de ambiente

| Variável            | Padrão                              | Descrição                       |
| ------------------- | ----------------------------------- | ------------------------------- |
| `ATOM_CANVAS_PORT`  | `8765`                              | Porta do servidor               |
| `ATOM_CANVAS_TOKEN` | aleatório a cada execução           | Token fixo de acesso            |
| `ATOM_SHELL`        | `pwsh`/`powershell` (Win), `$SHELL` | Shell aberto nos terminais      |
| `ATOM_MAX_TERMINALS`| `128`                               | Máx. de terminais simultâneos   |
| `ATOM_CANVAS_DATA`  | pasta do projeto                    | Onde ficam `layout.json` e `workspaces/` |

## Atalhos

| Atalho                      | Ação                                |
| --------------------------- | ----------------------------------- |
| `Alt+T` / `Alt+N`           | Novo terminal / nova nota           |
| `Alt+Enter`                 | Maximizar / restaurar janela ativa  |
| `Alt+F`                     | Tela cheia da janela ativa          |
| `Alt+0`                     | Ajustar tudo na tela                |
| `Ctrl+=` / `Ctrl+-`         | Fonte do terminal focado            |
| `Ctrl+Shift+F`              | Buscar no terminal                  |
| `Alt+[` / `Alt+]`           | Janela anterior / próxima           |
| Scroll no fundo / Ctrl+Scroll | Zoom                              |
| Arrastar fundo              | Mover canvas                        |
| Duplo clique no fundo       | Novo terminal no ponto              |
| Botão direito no fundo      | Menu de contexto                    |
| Botão direito no header     | Menu da janela                      |
| `?`                         | Ajuda                               |

## Estrutura

```
server.py            backend aiohttp: WebSocket de terminal, API de layout/workspaces
desktop.py           launcher desktop opcional (pywebview)
iniciar.sh           launcher Linux/macOS (cria .venv automaticamente)
iniciar.bat          launcher Windows (navegador)
iniciar-desktop.bat  launcher Windows (desktop)
docs/                documentação de arquitetura (MD + HTML)
static/index.html    UI
static/app.js        canvas, janelas, terminais
static/style.css     tema
static/vendor/       xterm.js + addons (MIT)
layout.json          layout salvo (ignorado no git)
workspaces/          workspaces salvos (ignorado no git)
tests/test_server.py testes do backend (unittest, abre shell real)
tests/e2e/           testes E2E opcionais no navegador (playwright-core + Chrome/Edge)
```

## Testes

```bash
python -m unittest discover -s tests -v      # backend: auth, layout, workspaces, PTY
cd tests/e2e && npm install && node e2e.js    # E2E (opcional): ATOM_PY=<python> CHROME=<navegador>
```

Os testes usam uma pasta de dados temporária (`ATOM_CANVAS_DATA`) e porta própria — não tocam no seu `layout.json`.

## Segurança

O ATOM Canvas dá **acesso total a um shell** da sua máquina pelo navegador. Por isso:

- O servidor escuta só em `127.0.0.1` — **não** exponha a porta na rede/internet (sem `0.0.0.0`, port-forward ou túnel).
- Toda requisição exige o token da URL; WebSocket de outras origens é bloqueado.
- Não compartilhe a URL com o token.

## Licença

MIT — veja [LICENSE](LICENSE). xterm.js é MIT — veja `static/vendor/LICENSE-xterm.txt`.
