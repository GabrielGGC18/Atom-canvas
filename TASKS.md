# ATOM Canvas — Tasks v2 (UI/UX + Terminal)

Legenda: [x] feito · [ ] pendente

## T1 — Terminal maior
- [x] Tamanho padrão do terminal: 640x380 → 960x580
- [x] Tamanho mínimo: 320x180
- [x] Resize por borda direita, borda inferior e canto (antes só canto)
- [x] Atalho `Alt+Enter` maximiza/restaura o terminal ativo

## T2 — Maximizar e tela cheia
- [x] Botão **Maximizar**: janela ocupa área toda do canvas (fora do zoom → sem desalinhamento do mouse)
- [x] Botão **Tela cheia**: Fullscreen API do navegador, sem toolbar
- [x] `Esc` (fora do terminal, p/ não quebrar vim) ou clique no fundo escuro sai do maximizado; sair do fullscreen restaura posição original
- [x] Duplo clique no header alterna maximizado
- [x] Fundo desfocado (backdrop blur) quando há janela maximizada

## T3 — Novo design
- [x] Paleta dark nova (variáveis CSS), acento gradiente roxo → ciano
- [x] Toolbar flutuante em pílula com ícones SVG
- [x] Fundo com grade de pontos + vinheta
- [x] Janelas com cantos 14px, sombra profunda, anel de foco no ativo
- [x] Header com cor da janela, ícone por tipo, botões com hover
- [x] Tema de terminal completo (16 cores ANSI)
- [x] Nota estilo post-it escuro com cor da janela
- [x] Animação de entrada das janelas

## T4 — Opções extras
- [x] Cor por janela (clique na bolinha do header → cicla 8 cores)
- [x] Fonte do terminal A− / A+ (por janela, salvo) — também `Ctrl+=` / `Ctrl+-` com terminal focado
- [x] Minimizar (recolhe para só o header)
- [x] Duplicar janela
- [x] Zoom: botões − / + , % clicável volta 100%, **Ajustar tudo** (`Alt+0`)
- [x] Snap na grade (toggle na toolbar, salvo)
- [x] Menu de contexto (botão direito no fundo): terminal aqui, terminal em pasta…, nota aqui, ajustar tudo, centralizar
- [x] Terminal em pasta específica (cwd salvo por janela)
- [x] Atalhos: `Alt+T` terminal, `Alt+N` nota, `Alt+0` ajustar, `Alt+Enter` maximizar, `Alt+F` tela cheia, `?` ajuda
- [x] Painel de ajuda com atalhos
- [x] Barra de status: nº terminais / notas / conectados

## T5 — Entregue
- [x] Sessões persistentes (shell sobrevive ao reload da página)
- [x] Conexões/linhas entre janelas
- [x] Botão "Abrir Claude Code aqui" (roda `claude` no cwd)
- [x] Minimap no canto
- [x] Workspaces (vários canvases salvos)
- [x] Janela Markdown preview / imagem / browser (iframe)
- [x] xterm.js local (sem CDN) + app desktop opcional com pywebview
- [x] Busca no terminal (addon-search) e links clicáveis (addon-web-links)
