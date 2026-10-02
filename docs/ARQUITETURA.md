# ATOM Canvas — Arquitetura

> Documento técnico da arquitetura do ATOM Canvas: componentes, fluxos de dados, protocolos, modelo de dados, segurança e pontos de extensão.
> Versão visual (HTML): [`arquitetura.html`](arquitetura.html).

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Stack e dependências](#2-stack-e-dependências)
3. [Estrutura de arquivos](#3-estrutura-de-arquivos)
4. [Diagrama de componentes](#4-diagrama-de-componentes)
5. [Backend — `server.py`](#5-backend--serverpy)
6. [Launcher desktop — `desktop.py`](#6-launcher-desktop--desktoppy)
7. [Frontend — `static/`](#7-frontend--static)
8. [Protocolos e API](#8-protocolos-e-api)
9. [Modelo de dados e persistência](#9-modelo-de-dados-e-persistência)
10. [Fluxos principais](#10-fluxos-principais)
11. [Sistema de coordenadas do canvas](#11-sistema-de-coordenadas-do-canvas)
12. [Camadas visuais (z-order)](#12-camadas-visuais-z-order)
13. [Segurança](#13-segurança)
14. [Configuração](#14-configuração)
15. [Limitações conhecidas](#15-limitações-conhecidas)
16. [Suporte multiplataforma](#16-suporte-multiplataforma)
17. [Como estender](#17-como-estender)

---

## 1. Visão geral

ATOM Canvas é uma aplicação **local** (single-user) que exibe um **canvas infinito** no navegador onde o usuário posiciona janelas livres:

| Tipo de janela | `type`    | `mode`                            | Conteúdo                                               |
| -------------- | --------- | --------------------------------- | ------------------------------------------------------ |
| Terminal       | `term`    | —                                 | Shell real (PowerShell/bash) via PTY + xterm.js        |
| Nota           | `note`    | —                                 | `<textarea>` de texto livre                            |
| Preview        | `preview` | `markdown` / `image` / `browser`  | Editor+preview Markdown, `<img>` ou `<iframe>`          |

Plataformas suportadas: **Windows 10/11** (ConPTY via pywinpty, shell PowerShell) e **Linux/macOS** (pty POSIX via ptyprocess, shell do usuário). O frontend é idêntico nas duas; só a classe `Pty` muda de implementação.

Princípios de design:

- **Sem build**: frontend em HTML/CSS/JS puro, servido como arquivos estáticos. Bibliotecas de terceiros ficam em `static/vendor/` (sem CDN, funciona offline).
- **Backend mínimo**: um único processo Python assíncrono (aiohttp) que faz três coisas — servir arquivos, ponte WebSocket ↔ PTY e salvar/ler layout em JSON.
- **Estado no cliente, persistência no servidor**: o navegador é dono do estado do canvas; o servidor apenas grava o JSON recebido.
- **Local-first e privado**: escuta somente em `127.0.0.1` e exige token em toda requisição.

---

## 2. Stack e dependências

### Backend (Python ≥ 3.10)

| Pacote       | Plataforma      | Uso                                                        |
| ------------ | --------------- | ---------------------------------------------------------- |
| `aiohttp`    | todas           | Servidor HTTP + WebSocket assíncrono                        |
| `pywinpty`   | Windows         | Pseudo-terminal (ConPTY/winpty) — `winpty.PtyProcess`      |
| `ptyprocess` | Linux / macOS   | Pseudo-terminal POSIX — `ptyprocess.PtyProcessUnicode`     |
| `pywebview`  | opcional        | Janela desktop (`desktop.py`). Instalado via requirements no Windows; no Linux via `./iniciar.sh --desktop` (`pywebview[gtk]` + GTK/WebKit do sistema) |

Módulos da stdlib: `asyncio`, `json`, `os`, `re`, `secrets`, `sys`, `dataclasses`, `pathlib`, `threading`, `webbrowser`, `shutil`.

### Frontend

| Biblioteca                       | Arquivo                                 | Uso                                     |
| -------------------------------- | --------------------------------------- | --------------------------------------- |
| xterm.js 5.x                     | `static/vendor/xterm.js` / `xterm.css`  | Emulador de terminal no navegador       |
| @xterm/addon-fit                 | `static/vendor/xterm-addon-fit.js`      | Ajusta colunas/linhas ao tamanho do div |
| @xterm/addon-search              | `static/vendor/xterm-addon-search.js`   | Busca no buffer do terminal             |
| @xterm/addon-web-links           | `static/vendor/xterm-addon-web-links.js`| URLs clicáveis no terminal              |

APIs do navegador usadas: WebSocket, Fetch, Pointer Events, ResizeObserver, Fullscreen API, Canvas 2D (minimap), SVG (conexões), `localStorage`, `crypto.randomUUID`, Clipboard API.

---

## 3. Estrutura de arquivos

```
atom-canvas/
├── server.py                 Backend: HTTP, WebSocket/PTY, API de layout e workspaces (≈236 linhas)
├── desktop.py                Launcher desktop opcional com pywebview (≈33 linhas)
├── iniciar.sh                Linux/macOS: cria .venv, instala deps, abre navegador (--desktop = pywebview)
├── iniciar.bat               Windows: sobe servidor e abre navegador
├── iniciar-desktop.bat       Windows: sobe modo desktop
├── requirements.txt          Dependências Python (com markers por plataforma)
├── README.md                 Guia de uso
├── TASKS.md                  Histórico de tarefas / roadmap
├── LICENSE                   MIT
├── .gitignore                Ignora dados locais (layout.json, workspaces/), venv, cache
├── .gitattributes            Normaliza fim de linha (LF; CRLF para .bat) — garante iniciar.sh executável no Linux
├── docs/
│   ├── ARQUITETURA.md        Este documento
│   └── arquitetura.html      Versão visual deste documento
├── static/
│   ├── index.html            Esqueleto da UI: toolbar, viewport, overlay, minimap, menus, ajuda
│   ├── app.js                Toda a lógica do frontend (≈684 linhas)
│   ├── style.css             Tema e layout (≈148 linhas, variáveis CSS)
│   └── vendor/               xterm.js + addons + LICENSE-xterm.txt
│
├── layout.json               (gerado, ignorado no git) workspace "default"
└── workspaces/*.json         (gerado, ignorado no git) demais workspaces
```

---

## 4. Diagrama de componentes

```
┌──────────────────────────── Navegador (ou janela pywebview) ─────────────────────────────┐
│                                                                                          │
│  index.html ── style.css                                                                 │
│      │                                                                                   │
│      ▼                                                                                   │
│  app.js                                                                                  │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────┐  ┌────────────────┐   │
│  │ View       │  │ Nós (Map)    │  │ Conexões    │  │ Minimap    │  │ Persistência   │   │
│  │ pan/zoom   │  │ term/note/   │  │ SVG Bézier  │  │ Canvas 2D  │  │ save() debounce│   │
│  │ fitAll     │  │ preview      │  │             │  │            │  │ 400 ms → PUT   │   │
│  └────────────┘  └──────┬───────┘  └─────────────┘  └────────────┘  └───────┬────────┘   │
│                         │ xterm.js + addons                                 │            │
│                         │ 1 WebSocket por terminal                          │ fetch      │
└─────────────────────────┼───────────────────────────────────────────────────┼────────────┘
                          │ ws://127.0.0.1:8765/ws/term?token&sid&cwd…         │ /api/*?token
┌─────────────────────────┼───────────────────────────────────────────────────┼────────────┐
│  server.py (aiohttp, 127.0.0.1)                                             │            │
│                         ▼                                                   ▼            │
│  ┌───────────────────────────────┐                    ┌──────────────────────────────┐   │
│  │ ws_term                       │                    │ get_layout / put_layout      │   │
│  │  check_auth (token + Origin)  │                    │ list_workspaces              │   │
│  │  SESSIONS[sid] → Session      │                    │  _workspace_name (sanitiza)  │   │
│  │   ├─ Pty (winpty/ptyprocess)  │                    │  _layout_path                │   │
│  │   ├─ pump(): PTY → WS         │                    └──────────────┬───────────────┘   │
│  │   └─ output (últimos 24 KB)   │                                   │                   │
│  └───────────────┬───────────────┘                                   ▼                   │
│                  │                                     layout.json / workspaces/*.json   │
└──────────────────┼───────────────────────────────────────────────────────────────────────┘
                   ▼
        Processo shell (powershell.exe / pwsh / $SHELL) por sessão
```

---

## 5. Backend — `server.py`

### 5.1 Constantes e configuração

| Nome         | Valor                                                          |
| ------------ | -------------------------------------------------------------- |
| `BASE`       | Pasta do `server.py`                                           |
| `STATIC`     | `BASE/static`                                                  |
| `LAYOUT`     | `BASE/layout.json` — workspace `default`                       |
| `WORKSPACES` | `BASE/workspaces/` — demais workspaces                         |
| `HOST`       | `127.0.0.1` (fixo)                                             |
| `PORT`       | `ATOM_CANVAS_PORT` ou `8765`                                   |
| `TOKEN`      | `ATOM_CANVAS_TOKEN` ou `secrets.token_urlsafe(16)` por execução |
| `SHELL`      | `ATOM_SHELL` ou `_default_shell()`                             |
| `PTY_READERS`| `ThreadPoolExecutor(ATOM_MAX_TERMINALS=128)` — threads de leitura dos PTYs |

`_default_shell()`:
- POSIX (Linux/macOS) → `$SHELL` se existir → `bash` → `zsh` → `/bin/sh`.
- Windows → `pwsh.exe` (se no PATH) → `powershell.exe` (se no PATH) → caminho absoluto `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (necessário quando o PATH herdado não contém o PowerShell, ex.: iniciado via Git Bash).

### 5.2 Workspaces

- `_workspace_name(value)`: normaliza nome → `default` para vazio/`layout`; remove tudo fora de `[a-zA-Z0-9 _-]`; espaços → `-`; máximo 64 caracteres. **Impede path traversal** (`../`, `\`, `:` são removidos).
- `_layout_path(name)`: `default` → `layout.json`; outros → `workspaces/<nome>.json` (cria pasta se preciso).
- `_empty_layout()`: `{"nodes": [], "connections": [], "view": null}`.

### 5.3 Abstração de PTY — classe `Pty`

Interface única sobre duas implementações:

| Método            | Windows (`winpty.PtyProcess`)          | POSIX (`ptyprocess.PtyProcessUnicode`) |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `__init__`        | `spawn(SHELL, cwd, dimensions=(r,c))`  | `spawn([SHELL], cwd, env, dimensions=(r,c))` com `TERM=xterm-256color`, `COLORTERM=truecolor` |
| `read()`          | `read(4096)` — **bloqueante**          | idem                                   |
| `write(data)`     | envia teclas ao shell                  | idem                                   |
| `resize(c, r)`    | `setwinsize(rows, cols)`               | idem                                   |
| `alive()`         | `isalive()`                            | idem                                   |
| `kill()`          | `terminate(force=True)`                | idem                                   |

Como `read()` bloqueia, ele roda em thread via `loop.run_in_executor(PTY_READERS, ...)`, sem travar o event loop. Cada terminal ocupa **uma thread permanente**; por isso há um pool dedicado (`PTY_READERS`, padrão 128) — o executor padrão do asyncio (`min(32, cpus+4)` threads) faria novos terminais congelarem após ~12 abertos.

### 5.3.1 Encerramento

`create_app()` registra `_kill_sessions` em `app.on_shutdown`: ao parar o servidor (`Ctrl+C`), todos os PTYs recebem `terminate(force=True)`, `SESSIONS` é limpo e o pool é desligado sem esperar. Isso desbloqueia as threads presas em `read()` e evita que o processo trave na saída.

### 5.4 Sessões persistentes — `Session` e `SESSIONS`

```python
@dataclass
class Session:
    sid: str        # id vindo do cliente (data.sessionId)
    cwd: str
    pty: Pty
    output: str     # buffer circular dos últimos 24.000 caracteres
    ws: object      # WebSocket atualmente anexado (ou None)
    task: object    # asyncio.Task do pump
    cols: int; rows: int
```

`SESSIONS: dict[sid, Session]` vive em memória do processo. Isso desacopla o **shell** da **conexão**:

- Fechar/recarregar a aba encerra só o WebSocket; o shell continua rodando.
- Ao reconectar com o mesmo `sid`, o servidor reanexa a sessão e reenvia `output` (replay do histórico recente).
- Se outra aba se conectar ao mesmo `sid`, a conexão antiga é fechada (uma conexão ativa por sessão).
- Se o processo do shell morreu, a sessão é descartada e outra é criada.

### 5.5 Handler `ws_term` — passo a passo

1. `check_auth` (token + Origin).
2. Resolve `cwd` (inválido → home do usuário) e `sid` (ausente → gera um).
3. `ws.prepare()` — handshake WebSocket.
4. Busca `SESSIONS[sid]`; se não existe ou morreu → cria `Session` com novo `Pty`. Falha ao abrir o shell → envia mensagem de erro em vermelho e fecha.
5. Para sessão nova, cria a task `pump()`:
   - lê do PTY em thread → guarda em `output` → envia `{"t":"o","d":...}` ao WS anexado (se houver);
   - quando o shell termina → envia `{"t":"exit"}` e fecha o WS.
6. Anexa o WS atual à sessão (fechando o anterior) e envia o replay de `output`.
7. Aplica `resize` com `cols/rows` da query.
8. Loop de mensagens do cliente: `i` → `pty.write`; `r` → `pty.resize`.
9. No `finally`, desanexa o WS (o shell **não** é morto).

### 5.6 Handlers HTTP

| Rota                  | Método | Handler           | Descrição                                    |
| --------------------- | ------ | ----------------- | -------------------------------------------- |
| `/`                   | GET    | `index`           | Entrega `static/index.html`                  |
| `/static/*`           | GET    | `add_static`      | Arquivos estáticos                           |
| `/ws/term`            | GET→WS | `ws_term`         | Terminal                                     |
| `/api/layout`         | GET    | `get_layout`      | Lê layout do workspace                       |
| `/api/layout`         | PUT    | `put_layout`      | Grava layout do workspace                    |
| `/api/workspaces`     | GET    | `list_workspaces` | Lista nomes (`default` primeiro); `?details=1` traz janelas/terminais/ativos |
| `/api/workspaces`     | DELETE | `delete_workspace`| Exclui workspace e encerra seus shells (`default` é protegido) |
| `/api/workspaces/rename`    | POST | `rename_workspace`    | Renomeia (`?workspace=&to=`), mantém os shells |
| `/api/workspaces/duplicate` | POST | `duplicate_workspace` | Copia o layout; a cópia abre shells novos      |
| `/api/session`        | DELETE | `delete_session`  | Encerra o shell de um `sid`                  |
| `/api/health`         | GET    | `health`          | `{ok, sessions, shell}` — usado no boot      |

`create_app()` monta o roteamento (reutilizado por `desktop.py`); `main()` imprime a URL com token, abre o navegador se `--open` e roda `web.run_app`.

---

## 6. Launcher desktop — `desktop.py`

1. Importa `HOST, PORT, TOKEN, create_app` de `server.py` (mesmo token gerado no import).
2. Sobe `web.run_app` numa **thread daemon** com `handle_signals=False` (sinais só funcionam na thread principal).
3. Aguarda 350 ms e abre `webview.create_window("ATOM Canvas", url_com_token, 1440x900)`.
4. `webview.start()` bloqueia a thread principal; ao fechar a janela, o processo termina e leva o servidor junto.

---

## 7. Frontend — `static/`

### 7.1 `index.html` — esqueleto

| Elemento            | Função                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `#toolbar`          | Barra flutuante: marca, workspace, novo terminal/nota, menu "Abrir", zoom, ajustar, grade, mapa, ajuda |
| `#resourceMenu`     | Submenu Markdown / Imagem / Navegador                                  |
| `#viewport`         | Área visível, captura pan/zoom/duplo clique/menu de contexto           |
| `#world`            | Plano infinito transformado (`translate + scale`) que contém as janelas e o SVG de conexões |
| `#overlay`          | Camada fixa para janela maximizada/tela cheia, com fundo desfocado      |
| `#minimap`          | `<canvas>` com visão geral                                             |
| `#status`           | Barra de status (contagem, conexões, zoom)                              |
| `#ctx`              | Menu de contexto (preenchido dinamicamente)                            |
| `#help`             | Modal de atalhos                                                       |

Scripts carregados em ordem: xterm → addons → `app.js` (globais `Terminal`, `FitAddon`, `SearchAddon`, `WebLinksAddon`).

### 7.2 `app.js` — módulos lógicos

O arquivo é um script único organizado em seções:

| Seção                    | Principais símbolos                                              | Responsabilidade                                      |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Constantes               | `GRID=24`, `COLORS[8]`, `SIZES`, `MIN`, `P` (ícones SVG), `TERM_THEME` | Configuração visual                              |
| Estado global            | `view`, `nodes: Map`, `connections[]`, `active`, `zTop`, `snap`, `workspace`, `connectSource` | Estado do canvas              |
| Conexões                 | `linkLayer` (SVG), `renderConnections()`                         | Curvas Bézier entre centros das janelas, seta, remoção por duplo clique |
| Minimap                  | `renderMinimap()`, clique no canvas                              | Desenha retângulos dos nós e retângulo da viewport; clique centraliza |
| View                     | `applyView`, `toWorld`, `zoomAt`, `zoomCenter`, `fitAll`         | Pan, zoom ancorado no cursor, enquadrar tudo           |
| Persistência             | `save()`, `updateStatus()`                                       | Debounce 400 ms → `PUT /api/layout`; barra de status   |
| Nós                      | `addNode`, `dragOp`, `place`, `focusNode`, `removeNode`, `duplicate` | Ciclo de vida e geometria das janelas             |
| Maximizar/tela cheia     | `setMax`, `toggleFull`, `syncOverlay`, `fullscreenchange`        | Move a janela para `#overlay` e usa Fullscreen API     |
| Nota                     | `initNote`                                                       | `<textarea>` ligado a `data.text`                      |
| Preview                  | `initPreview`, `markdownToHtml`                                  | Markdown (editor + render), imagem, iframe sandbox     |
| Conexões (interação)     | `beginConnection`, `completeConnection`                          | Modo "conectar": clica origem → clica destino          |
| Terminal                 | `initTerm`, `setFont`, `openClaude`, `searchTerm`                | xterm.js, WebSocket, resize, atalhos, reinício         |
| Criação                  | `addAtCenter`, `addResourceAtCenter`, `askCwd`                   | Cria nós no centro/no ponto, pede URL/pasta            |
| Workspaces               | `clearCanvas`, `loadWorkspace`, `loadWorkspaces`                 | Troca de canvas salvo                                  |
| Menu de contexto         | listener `contextmenu`                                           | Ações no ponto clicado                                 |
| Toolbar                  | handlers de botões                                               | Zoom, grade, mapa, workspace, ajuda                    |
| Atalhos                  | listener `keydown` em captura                                    | `Alt+T/N/0/Enter/F`, `Esc`, `?`                        |
| Boot                     | IIFE assíncrona                                                  | Valida token, carrega workspaces e layout              |

### 7.3 Objeto de nó em memória

Cada entrada em `nodes` (chave = `data.id`) é:

```js
{
  data,        // serializável — vai para o JSON (ver seção 9)
  el,          // HTMLElement .node
  // só terminais:
  term,        // instância xterm.Terminal
  ws,          // WebSocket atual
  fit(),       // ajusta xterm ao tamanho e envia resize
  restart(),   // novo sessionId, reset do xterm, reconecta
  search,      // SearchAddon
  ro,          // ResizeObserver do corpo
  // estado transitório:
  maxed, fs, fsRestore
}
```

### 7.4 Anatomia de uma janela (`.node`)

```
.node.term|.note|.preview [.active][.min][.max][.dead][.connecting]   (--c = cor da janela)
├── header                          arrastar · duplo clique = maximizar
│   ├── .dot                        clique = próxima cor (8 cores)
│   ├── .kind                       ícone do tipo
│   ├── .title                      duplo clique = renomear (contentEditable)
│   ├── .cwd                        última parte do cwd/URL (tooltip = completo)
│   └── .actions                    A− [fs] A+ ⟳ ✦Claude 🔍 (só term) · elo · duplicar · minimizar · maximizar · tela cheia · fechar
├── .body                           conteúdo (xterm / textarea / preview)
└── .rz.r  .rz.b  .rz.br            alças de redimensionar (direita, baixo, canto)
```

### 7.5 `style.css` — sistema visual

- **Tokens** em `:root`: `--bg`, `--panel` (translúcido), `--panel-solid`, `--head`, `--border`, `--border-hi`, `--text`, `--muted`, `--accent` (#7c5cff), `--accent2` (#22d3ee), `--grad`, `--danger`, `--ok`, `--radius` (14px), `--shadow`.
- **Cor por janela**: variável `--c` em cada `.node`, combinada via `color-mix()` no header, anel de foco e fundo da nota.
- **Glass UI**: toolbar, status, menus com `backdrop-filter: blur()`.
- **Grade de pontos**: `radial-gradient` no `#viewport`, com `background-size`/`position` sincronizados ao zoom/pan em `applyView()`; vinheta via `::after`.
- **Estados**: `.active` (anel), `.dead` (bolinha vermelha), `.min` (só header, 38px), `.max` (fixed, ignora geometria com `!important`), `:fullscreen`, `.connecting` (anel ciano).
- Animação `pop` na criação.

---

## 8. Protocolos e API

### 8.1 WebSocket `/ws/term`

**URL**: `ws://127.0.0.1:<PORT>/ws/term?token=<T>&cols=<C>&rows=<R>&cwd=<pasta>&sid=<sessionId>`

Mensagens são JSON em frames de texto.

Cliente → servidor:

| Mensagem                       | Significado                        |
| ------------------------------ | ---------------------------------- |
| `{"t":"i","d":"<texto>"}`      | Entrada de teclado para o shell    |
| `{"t":"r","c":<cols>,"r":<rows>}` | Redimensionar PTY               |
| `{"t":"kill"}`                 | Encerra o shell da sessão          |

Mensagens malformadas são ignoradas (o terminal não cai).

Servidor → cliente:

| Mensagem                       | Significado                                     |
| ------------------------------ | ----------------------------------------------- |
| `{"t":"o","d":"<texto>"}`      | Saída do shell (inclui sequências ANSI)         |
| `{"t":"hello","resumed":bool,"cwd":..,"shell":..}` | Primeira mensagem; `resumed` indica sessão retomada (cliente limpa a tela antes do replay) |
| `{"t":"exit"}`                 | Shell terminou; WebSocket será fechado          |

### 8.2 HTTP

Todas exigem `?token=<T>`; resposta `403` sem token válido ou com `Origin` estranha.

```
GET  /api/workspaces                      → ["default", "projeto-x", ...]
GET  /api/layout?workspace=<nome>         → { view, nodes, connections }
PUT  /api/layout?workspace=<nome>         ← { view, nodes, connections }  → {"ok": true, "workspace": <nome canônico>}
GET  /api/workspaces?details=1            → [{name, windows, terminals, running, updated}, ...]
POST /api/workspaces/rename?workspace=<a>&to=<b>     → {"ok": true, "workspace": <b canônico>}  (409 se já existe)
POST /api/workspaces/duplicate?workspace=<a>&to=<b>  → {"ok": true, "workspace": <b canônico>}  (409 se já existe)
DELETE /api/workspaces?workspace=<nome>   → {"ok": true, "killed": n}
DELETE /api/session?sid=<sid>             → {"ok": true, "killed": bool}
GET  /api/health                          → {"ok": true, "sessions": n, "shell": "pwsh.exe"}
```

O PUT grava em arquivo temporário + `os.replace` (atômico). Layout com JSON inválido no disco é
renomeado para `<arquivo>.corrupt` e o GET devolve um layout vazio.

```
```

---

## 9. Modelo de dados e persistência

### 9.1 Formato do layout (JSON)

```json
{
  "view": { "x": -120.5, "y": 40, "s": 0.85 },
  "nodes": [
    {
      "id": "uuid", "type": "term",
      "x": 100, "y": 100, "w": 960, "h": 580,
      "title": "Terminal", "color": "#7c5cff",
      "cwd": "C:\\projetos\\app", "fontSize": 14, "min": false,
      "sessionId": "uuid",
      "text": "", "url": "", "mode": "browser"
    }
  ],
  "connections": [
    { "id": "uuid", "from": "<node id>", "to": "<node id>" }
  ]
}
```

| Campo        | Tipos          | Descrição                                              |
| ------------ | -------------- | ------------------------------------------------------ |
| `view.x/y`   | todos          | Translação do mundo em px de tela                      |
| `view.s`     | todos          | Escala (0.15 – 2.5)                                    |
| `x,y,w,h`    | todos          | Geometria em coordenadas de mundo                      |
| `color`      | todos          | Uma das 8 cores de `COLORS`                            |
| `min`        | todos          | Minimizada                                             |
| `cwd`        | term           | Pasta inicial do shell                                 |
| `fontSize`   | term           | 9 – 28                                                 |
| `sessionId`  | term           | Liga a janela à `Session` do servidor                  |
| `text`       | note / markdown| Conteúdo                                               |
| `mode`, `url`| preview        | `markdown` / `image` / `browser` e URL                 |

### 9.2 Onde cada coisa fica

| Dado                                | Local                                    | Escopo           |
| ----------------------------------- | ---------------------------------------- | ---------------- |
| Layout do workspace `default`       | `layout.json`                            | disco, servidor  |
| Outros workspaces                   | `workspaces/<nome>.json`                 | disco, servidor  |
| Shell + histórico recente (24 KB)   | `SESSIONS` (RAM)                         | vida do processo |
| Grade ligada (`atomSnap`)           | `localStorage`                           | navegador        |
| Último workspace (`atomWorkspace`)  | `localStorage`                           | navegador        |
| Última pasta usada (`atomLastCwd`)  | `localStorage`                           | navegador        |

Gravação: toda mutação chama `save()`, que reinicia um timer de **400 ms** e envia o estado completo via `PUT` (último estado vence). Arquivos de layout ficam fora do git (contêm caminhos e textos pessoais).

---

## 10. Fluxos principais

### 10.1 Inicialização

```
python server.py --open
  → gera TOKEN, imprime http://127.0.0.1:8765/?token=…
  → abre navegador
Navegador
  → GET /  → index.html, style.css, vendor/*, app.js
  → app.js lê token da URL
  → GET /api/layout (validação do token; 403 → tela "Token inválido")
  → GET /api/workspaces → popula <select>
  → loadWorkspace(atual): GET /api/layout → applyView → addNode() para cada nó
  → canvas vazio? cria um terminal no centro
```

### 10.2 Terminal: digitação e saída

```
tecla → xterm.onData → ws.send {"t":"i"} → ws_term → pty.write → shell
shell imprime → pty.read (thread) → pump → session.output += … → ws.send {"t":"o"} → term.write
```

### 10.3 Redimensionar

```
arrastar alça → dragOp → data.w/h → place() → ResizeObserver(.body)
  → debounce 30 ms → fit.fit() → cols/rows → ws.send {"t":"r"} → pty.resize
```

### 10.4 Recarregar a página (sessão persistente)

```
reload → WS fecha → finally: session.ws = None (shell segue vivo, pump segue lendo e bufferizando)
nova página → layout traz sessionId → WS com mesmo sid
  → servidor encontra SESSIONS[sid] vivo → anexa → envia replay de output
```

### 10.5 Reiniciar shell (⟳)

Gera **novo** `sessionId`, `term.reset()`, reconecta → servidor cria sessão nova. A sessão antiga continua viva em memória até o servidor parar (ver limitações).

### 10.6 Maximizar / tela cheia

```
setMax(on):  desmaximiza outras → move .node para #overlay → classe .max (fixed, fora do transform)
             overlay.on (blur) → foco no xterm
setMax(off): remove .max → volta para #world → place()
toggleFull:  setMax(true) → el.requestFullscreen()
             fullscreenchange (saiu) → restaura se estava normal antes
```

Fora do `#world`, a janela não sofre `scale()` — seleção de texto e mouse do xterm ficam precisos.

### 10.7 Conexões

```
botão elo na janela A → connectSource = A (.connecting)
clique na janela B   → connections.push({from:A,to:B}) → renderConnections() → save()
duplo clique na linha → remove
```

### 10.8 Workspaces

```
<select> change → loadWorkspace(nome) → clearCanvas() (fecha WS, descarta xterm; shells seguem no servidor)
                → GET /api/layout?workspace=nome → recria nós
"+" → prompt nome → loadWorkspaces() → loadWorkspace(nome) → primeiro save() cria o arquivo
```

---

## 11. Sistema de coordenadas do canvas

- **Tela**: pixels do navegador (`clientX/Y`).
- **Mundo**: coordenadas onde `data.x/y/w/h` vivem.
- `#world` recebe `transform: translate(view.x, view.y) scale(view.s)`, origem `0 0`.

Conversões:

```
tela → mundo:  wx = (cx - viewport.left - view.x) / view.s
mundo → tela:  cx = wx * view.s + view.x + viewport.left
```

Zoom ancorado no cursor (o ponto sob o mouse fica parado):

```
ns = clamp(view.s * fator, 0.15, 2.5)
view.x = px - (px - view.x) * (ns / view.s)
view.y = py - (py - view.y) * (ns / view.s)
```

Arraste/resize dividem o delta do mouse por `view.s` para mover em unidades de mundo. Com grade ligada, `snapV()` arredonda para múltiplos de 24.

`fitAll()` calcula o retângulo envolvente de todos os nós e escolhe `s = min(1.2, larguraÚtil/larguraTotal, alturaÚtil/alturaTotal)`, centralizando abaixo da toolbar.

---

## 12. Camadas visuais (z-order)

| z-index | Camada                                  |
| ------- | --------------------------------------- |
| base    | `#viewport` → `#world` (janelas, SVG)   |
| 1…n     | `.node` — `zTop` incrementa no foco     |
| 20      | `#overlay` (janela maximizada)          |
| 29      | `#minimap`                              |
| 30      | `#toolbar`, `#status`                   |
| 40      | `#ctx` (menu de contexto)               |
| 50      | `#help` (modal)                         |
| top layer | elemento em tela cheia (Fullscreen API) |

---

## 13. Segurança

O produto **expõe um shell completo** pelo navegador. Modelo de ameaça e defesas:

| Ameaça                                                     | Defesa                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Outra máquina na rede acessar o shell                      | Bind fixo em `127.0.0.1`                                                                 |
| Outro usuário/processo local ou site adivinhar a URL       | Token aleatório (128 bits) obrigatório em HTTP e WS                                      |
| Site malicioso abrir WebSocket para localhost (CSWSH)      | Checagem de `Origin`: só `http://127.0.0.1:<PORT>` e `http://localhost:<PORT>`           |
| Path traversal pelo nome do workspace                      | `_workspace_name` permite só `[a-zA-Z0-9 _-]`, máx. 64                                   |
| XSS por Markdown                                           | `markdownToHtml` escapa `& < > " '` **antes** de aplicar a formatação                   |
| Vazamento de dados pessoais no git                         | `layout.json` e `workspaces/` no `.gitignore`                                           |

Recomendações operacionais: nunca usar `0.0.0.0`, port-forward, ngrok/túneis; não compartilhar a URL com token; o token aparece no histórico do navegador — use `ATOM_CANVAS_TOKEN` só em máquina pessoal.

---

## 14. Configuração

| Variável            | Padrão                                    | Efeito                         |
| ------------------- | ----------------------------------------- | ------------------------------ |
| `ATOM_CANVAS_PORT`  | `8765`                                    | Porta HTTP/WS                  |
| `ATOM_CANVAS_TOKEN` | aleatório                                 | Token fixo                     |
| `ATOM_SHELL`        | `pwsh`→`powershell` (Win) / `$SHELL`      | Executável do shell            |
| `ATOM_MAX_TERMINALS`| `128`                                     | Tamanho do pool de leitura (máx. terminais simultâneos) |
| `ATOM_CANVAS_DATA`  | pasta do projeto                          | Diretório de `layout.json` e `workspaces/` |

Argumento de linha de comando: `--open` abre o navegador automaticamente.

---

## 15. Limitações conhecidas

1. ~~Sessões órfãs~~ — resolvido na v3: fechar (✕) chama `DELETE /api/session` após o prazo do "Desfazer"; reiniciar (⟳) encerra a sessão antiga. Trocar de workspace mantém os shells de propósito (voltar ao workspace reconecta); excluir o workspace os encerra.
2. **Sessões não sobrevivem ao reinício do servidor** (ficam só em RAM). O layout volta; os shells são novos.
3. **iframe**: o preview "Navegador" usa `sandbox` com `allow-scripts`; `allow-same-origin` só é dado a URLs de outra origem (uma página do próprio servidor não consegue ler o token). Muitos sites bloqueiam iframe (`X-Frame-Options`).
4. **Zoom ≠ 100%**: seleção com mouse no xterm pode desalinhar (o xterm não conhece o `scale` CSS). Solução de uso: maximizar.
5. **Concorrência de abas**: duas abas no mesmo workspace sobrescrevem o JSON uma da outra (último `PUT` vence) e disputam as mesmas sessões.
6. **Markdown subset**: títulos, negrito/itálico/riscado, código inline e em bloco, listas (com checklist), citações, `---`, links e imagens `http(s)` — sem tabelas nem HTML cru (tudo é escapado).
7. **Buffer de replay** limitado a 200.000 caracteres por sessão.
8. Token trafega na query string (fica no histórico do navegador e em logs locais).

---

## 16. Suporte multiplataforma

| Aspecto                | Windows                                   | Linux / macOS                                |
| ---------------------- | ----------------------------------------- | -------------------------------------------- |
| PTY                    | `pywinpty` (ConPTY)                       | `ptyprocess` (pty POSIX)                     |
| Shell padrão           | `pwsh` → `powershell` (caminho absoluto)  | `$SHELL` → `bash` → `zsh` → `/bin/sh`        |
| Variáveis de terminal  | herdadas                                  | `TERM=xterm-256color`, `COLORTERM=truecolor` |
| Launcher               | `iniciar.bat` / `iniciar-desktop.bat`     | `./iniciar.sh` / `./iniciar.sh --desktop`    |
| Python                 | `py -3` ou `python`                       | `python3` em `.venv` criado automaticamente  |
| Desktop (pywebview)    | WebView2 (nativo do Windows)              | GTK + WebKit2 do sistema                     |
| Fim de linha           | `.bat` em CRLF                            | demais arquivos LF (`.gitattributes`)        |

O código do frontend, protocolo, API e formato de layout são idênticos. Caminhos são tratados com `pathlib` no backend e com `split(/[\\/]/)` no frontend (aceita `\` e `/`).

## 17. Como estender

### Novo tipo de janela

1. `SIZES.novo = { w, h }` e ícone em `P`.
2. Em `addNode`: título/cor padrão e `else if (type === "novo") initNovo(node)`.
3. Criar `initNovo(node)` que monta o conteúdo em `node.el.querySelector(".body")` e chama `save()` ao mudar `node.data`.
4. Botão na toolbar (`data-add="novo"`) e/ou item no menu de contexto.
5. CSS em `.node.novo .body`.

### Nova rota no backend

1. Handler `async def x(request): check_auth(request); ...`.
2. Registrar em `create_app()`.
3. Chamar do frontend sempre com `?token=${TOKEN}`.

### Novo atalho

Adicionar entrada no `map` do listener `keydown` (seção "atalhos") e uma linha na tabela do modal `#help` em `index.html`.

### Trocar shell por janela

Hoje o shell é global (`SHELL`). Para shell por janela: aceitar `shell` na query do WS (validando contra lista permitida) e passar para `Pty`.
