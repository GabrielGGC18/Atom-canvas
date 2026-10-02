# Melhoria 0 — Workspaces em abas + revisão de segurança

Este documento cobre duas partes: a melhoria de **múltiplos espaços de trabalho** e a **revisão de vulnerabilidades** do ATOM Canvas, com o que foi corrigido e o que ficou como recomendação.

---

## 1. Melhoria: vários espaços de trabalho em abas

### Antes

Os workspaces já existiam, mas ficavam escondidos em um `<select>` na toolbar. Só dava para criar, trocar e excluir. Não havia como renomear ou duplicar, e não dava para saber se um workspace em segundo plano ainda tinha terminais rodando.

### Agora

Uma **barra de abas** logo abaixo da toolbar mostra todos os workspaces:

| Recurso | Como usar |
|---|---|
| Trocar de workspace | Clique na aba ou `Alt+1` … `Alt+9` |
| Novo workspace | Botão **+** na barra ou `Alt+W` |
| Renomear | Duplo clique na aba, ou botão direito → *Renomear…* |
| Duplicar | Botão direito → *Duplicar…* (os terminais da cópia abrem shells novos) |
| Excluir | Botão direito → *Excluir* (também funciona para workspaces que não estão abertos) |
| Contagem de janelas | Número ao lado do nome |
| **Terminais em segundo plano** | Ponto verde com a quantidade de shells que continuam rodando nesse workspace |

Ao trocar de aba, os shells **não são encerrados**: o servidor os mantém vivos e, ao voltar, o terminal reconecta e reexibe a saída. Na prática dá para manter vários projetos abertos ao mesmo tempo (ex.: `frontend`, `api`, `infra`), cada um com seus terminais rodando, e alternar com `Alt+1/2/3`.

O workspace `default` aparece como **Principal**. Ele pode ser duplicado, mas não pode ser renomeado nem excluído.

### Implementação

**Backend (`server.py`)**

- `GET /api/workspaces?details=1` retorna `{name, windows, terminals, running, updated}` por workspace. `running` conta os `sessionId` do layout que ainda existem em `SESSIONS`.
- `POST /api/workspaces/rename?workspace=a&to=b` renomeia o arquivo e mantém os `sessionId`, então os shells continuam ligados. Responde 409 se o destino já existe; o `default` é protegido.
- `POST /api/workspaces/duplicate?workspace=a&to=b` copia o layout **removendo os `sessionId`**, para a cópia não dividir os mesmos processos com o original.
- `DELETE /api/workspaces` agora **encerra os shells** do workspace excluído. Antes, excluir um workspace que não estava aberto deixava processos órfãos.

**Frontend (`static/app.js`)**

- `renderWsTabs()` monta as abas. A aba atual usa os dados locais (janelas, terminais conectados); as demais usam o `details=1`, atualizado a cada 15 s.
- As ações de workspace passam por uma **fila** (`wsAction`). Sem ela, uma renomeação confirmada enquanto a troca de aba ainda carregava era descartada em silêncio (o teste E2E pegou esse caso).
- Renomear o workspace atual grava pendências antes e bloqueia saves durante a operação, para não recriar o arquivo com o nome antigo.

**Testes**

- Unitários: renomear/duplicar (incluindo 409 e o `default` protegido), `details=1`, exclusão que encerra shells, nomes reservados, cabeçalhos de segurança, checagem de Host e JSON aninhado.
- E2E: criar com `Alt+W`, voltar com `Alt+1`, confirmar o shell em segundo plano, renomear por duplo clique, ver o indicador verde, excluir pelo menu e checar que não ficou sessão órfã.

---

## 2. Revisão de vulnerabilidades

Modelo de ameaça: o servidor escuta só em `127.0.0.1` e cada requisição exige um token aleatório de 128 bits. Os riscos reais vêm de **sites maliciosos abertos no mesmo navegador**, de **outros programas locais** e de **conteúdo não confiável dentro do canvas** (Markdown, páginas em iframe).

### Corrigidas nesta melhoria

| # | Severidade | Problema | Correção |
|---|---|---|---|
| V1 | Média | **Sem checagem do cabeçalho `Host` (DNS rebinding).** Um site pode apontar o próprio domínio para 127.0.0.1 e passar a ser "same-origin" com o canvas. A API já exigia token, mas `/` e `/static` respondiam a qualquer Host. | Middleware `security` recusa com **421** qualquer Host que não seja `127.0.0.1` ou `localhost`. |
| V2 | Média | **Sem cabeçalhos de segurança.** Nenhum CSP, `X-Frame-Options` ou `nosniff`. Um XSS futuro (ex.: um bug no renderizador de Markdown) rodaria com acesso total ao token e aos terminais. | **CSP** restritiva (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`, `connect-src` só para o próprio servidor), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. O único script inline (`onclick` da tela de erro) foi movido para o `app.js`. |
| V3 | Média | **Shells órfãos ao excluir um workspace em segundo plano.** Os processos continuavam rodando sem nenhuma janela que os controlasse. | `DELETE /api/workspaces` encerra as sessões listadas no layout. |
| V4 | Média (Windows) | **Nomes reservados do Windows** (`CON`, `NUL`, `PRN`, `AUX`, `COM1-9`, `LPT1-9`). Um workspace chamado `con` virava `workspaces/con.json`, que no Windows é um dispositivo e não um arquivo: o layout se perdia ou a gravação travava. | O nome ganha o sufixo `-ws` (ex.: `CON-ws`), no servidor e no espelho do cliente. |
| V5 | Baixa | **JSON aninhado demais** (`[[[[…`) causava `RecursionError`: resposta 500 com traceback no console. | Responde 400. |
| V6 | Baixa | **Token fraco via `ATOM_CANVAS_TOKEN`.** Nada impedia um token curto e adivinhável. | Aviso no console se tiver menos de 16 caracteres. |

### Já estavam corretas (verificado)

- Comparação do token com `secrets.compare_digest` (sem vazamento por tempo de resposta).
- WebSocket e API recusam `Origin` estrangeira (testado: 403).
- Markdown: todo o texto é escapado antes da formatação; links e imagens aceitam só `http(s)`; links usam `rel="noopener noreferrer"`.
- Iframe do navegador: `sandbox` sem `allow-same-origin` para páginas do próprio servidor (senão leriam o token), e `referrerpolicy="no-referrer"`.
- Nomes de workspace sanitizados contra path traversal (`../../etc/passwd` → `etcpasswd`).
- Gravação atômica do layout (queda no meio não corrompe) e arquivo corrompido preservado como `.corrupt`.
- `layout.json` e `workspaces/` estão no `.gitignore` (notas e caminhos não vão para o Git por acidente).

### Recomendações (não implementadas)

| # | Severidade | Risco | Sugestão |
|---|---|---|---|
| R1 | Baixa | **Token na URL**: fica no histórico do navegador e é impresso no console. Quem tiver acesso ao histórico do usuário consegue abrir os terminais enquanto o servidor estiver rodando. | Trocar o token da URL por um cookie `HttpOnly; SameSite=Strict` no primeiro acesso e limpar a URL com `history.replaceState`. |
| R2 | Baixa | **Imagens externas no Markdown** carregam automaticamente e revelam IP e o momento em que a nota foi aberta (pixel de rastreamento). | Carregar imagens só depois de um clique, ou permitir apenas `data:`/`blob:`. |
| R3 | Baixa | **Sem limite de workspaces ou de tamanho total em disco.** Com o token, dá para criar milhares de arquivos de 32 MB. | Limitar a quantidade de workspaces (ex.: 200) e o tamanho total da pasta. |
| R4 | Informativa | **Qualquer aba com o token assume qualquer sessão** (`sid` escolhido pelo cliente). É o comportamento esperado para um único usuário, mas vale documentar. | Manter; se algum dia houver vários usuários, vincular as sessões a quem as criou. |
| R5 | Informativa | **Páginas no iframe têm `allow-scripts` e `allow-popups`.** Uma página maliciosa aberta no canvas pode abrir popups (que herdam o sandbox). | Oferecer um modo "iframe restrito" sem scripts para páginas não confiáveis. |

---

## 3. Correção extra encontrada durante os testes

**Erro intermitente `Cannot read properties of undefined (reading 'dimensions')`.** Ao abrir, o xterm.js agenda um `setTimeout(syncScrollArea)` interno. Fechar o terminal logo depois de criá-lo descartava o renderer antes desse timer rodar. Agora o `dispose` é adiado para o próximo ciclo; como a fila de timers é FIFO, o timer interno do xterm roda primeiro.

## 4. Resultado dos testes

- Unitários: **18/18**
- E2E: **25/25** (novo passo das abas), estável em execuções repetidas
