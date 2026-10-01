# Como rodar o ATOM Canvas

Este guia explica como preparar, iniciar e encerrar o ATOM Canvas em Linux, macOS e Windows.

O ATOM Canvas é uma aplicação local. O backend é executado em Python com `aiohttp`, enquanto a interface fica em `static/` e é servida diretamente pelo próprio backend. Não existe etapa de build nem necessidade de Node.js.

## 1. Requisitos

Antes de iniciar, tenha:

- Python 3.10 ou superior;
- Git, caso ainda precise clonar o projeto;
- um navegador moderno, como Chrome, Edge ou Firefox;
- acesso a um shell local: Bash/Zsh no Linux e macOS ou PowerShell no Windows.

O projeto abre terminais reais dentro do navegador. Portanto, os comandos digitados nos terminais do canvas serão executados na máquina em que o servidor estiver rodando.

## 2. Obter o projeto

Se o projeto ainda não estiver disponível localmente, clone o repositório e entre na pasta:

```bash
git clone https://github.com/GabrielGGC18/Atom-canvas.git
cd Atom-canvas
```

Se você já recebeu a pasta do projeto, basta abrir um terminal nela. Todos os comandos deste documento devem ser executados a partir da raiz, onde estão `server.py`, `requirements.txt` e `iniciar.sh`.

## 3. Linux e macOS

### 3.1 Instalação rápida com o script

No Debian ou Ubuntu, instale o Python e o suporte à criação de ambientes virtuais, caso ainda não estejam instalados:

```bash
sudo apt install python3 python3-venv
```

Depois, na raiz do projeto, torne o script executável se necessário e execute-o:

```bash
chmod +x iniciar.sh
./iniciar.sh
```

Na primeira execução, `iniciar.sh`:

1. verifica se o Python está disponível;
2. cria o ambiente virtual `.venv`;
3. atualiza o `pip`;
4. instala as dependências de `requirements.txt`;
5. inicia o servidor e tenta abrir o navegador automaticamente.

Nas execuções seguintes, o ambiente virtual já existente é reutilizado.

O script aceita argumentos adicionais. Por exemplo, o modo padrão abre a aplicação no navegador:

```bash
./iniciar.sh
```

### 3.2 Instalação manual

Use esta opção se quiser controlar cada etapa ou se o script não puder ser executado:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python server.py --open
```

O comando `source .venv/bin/activate` ativa o ambiente virtual apenas no terminal atual. Se ele não estiver ativado, use diretamente os executáveis do ambiente:

```bash
.venv/bin/python server.py --open
```

## 4. Windows

O arquivo `iniciar.bat` inicia o servidor e tenta abrir o navegador. Porém, antes do primeiro uso, é necessário instalar as dependências.

Abra o PowerShell na pasta do projeto e execute:

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Se o PowerShell bloquear a ativação do ambiente por causa da política de execução, a instalação ainda pode ser feita usando o Python do ambiente virtual diretamente:

```powershell
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Com o ambiente virtual ativado, inicie de uma destas formas:

```powershell
python server.py --open
```

ou, usando o launcher incluído:

```text
iniciar.bat
```

O arquivo `iniciar.bat` procura primeiro o launcher `py -3` e, se ele não existir, tenta usar `python`. Ele não ativa `.venv` sozinho. Por isso, o caminho mais previsível no primeiro uso é abrir o PowerShell, ativar o ambiente e executar `python server.py --open`.

Também é possível dar duplo clique em `iniciar.bat` no Explorador de Arquivos, desde que as dependências estejam instaladas no Python que o arquivo encontrar (`py -3` ou `python`). O mesmo vale para `iniciar-desktop.bat`.

## 5. Abrir a aplicação

Quando o servidor inicia, ele imprime uma URL semelhante a:

```text
http://127.0.0.1:8765/?token=SEU_TOKEN
```

Com `--open`, o navegador padrão é aberto automaticamente. Se isso não acontecer, copie a URL completa exibida no terminal e cole-a no navegador.

É importante usar a URL completa, incluindo `?token=...`. O token é gerado novamente a cada inicialização, por isso uma URL de uma execução anterior deixa de funcionar quando o servidor é reiniciado.

O endereço `127.0.0.1` significa que a aplicação está disponível somente nesta máquina. Não remova essa proteção usando `0.0.0.0`, port forwarding, túnel ou ferramentas como ngrok: o canvas dá acesso a um shell real do computador.

## 6. Rodar no modo desktop

O modo desktop abre o canvas em uma janela própria usando `pywebview`, em vez de uma aba comum do navegador.

### Windows

Depois de instalar `requirements.txt`, execute:

```powershell
python desktop.py
```

Ou dê duplo clique em:

```text
iniciar-desktop.bat
```

No Windows, `pywebview` é incluído automaticamente pelo `requirements.txt` por meio da dependência específica da plataforma.

### Linux

Além das dependências Python, o modo desktop precisa das bibliotecas GTK e WebKit do sistema. No Debian ou Ubuntu:

```bash
sudo apt install python3-gi gir1.2-webkit2-4.1
./iniciar.sh --desktop
```

O próprio script instala `pywebview[gtk]` no ambiente virtual quando necessário.

Se a porta padrão já estiver ocupada, o modo desktop informa o problema e encerra. Libere a porta ou escolha outra conforme a seção de configuração abaixo.

## 7. Configuração

O servidor escuta por padrão em `127.0.0.1:8765`. As variáveis abaixo podem ser definidas antes de iniciar:

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `ATOM_CANVAS_PORT` | `8765` | Define a porta HTTP e WebSocket. |
| `ATOM_CANVAS_TOKEN` | Token aleatório | Define um token fixo para a execução atual. |
| `ATOM_SHELL` | Shell padrão do sistema | Escolhe o shell aberto nos terminais. |
| `ATOM_MAX_TERMINALS` | `128` | Limita a quantidade de terminais simultâneos. |

### Exemplo no Linux/macOS

```bash
ATOM_CANVAS_PORT=8766 ./iniciar.sh
```

Ou, com instalação manual:

```bash
ATOM_CANVAS_PORT=8766 .venv/bin/python server.py --open
```

### Exemplo no PowerShell

```powershell
$env:ATOM_CANVAS_PORT = "8766"
python server.py --open
```

Para escolher outro shell no Linux/macOS:

```bash
ATOM_SHELL=/bin/zsh ./iniciar.sh
```

No Windows, `ATOM_SHELL` pode apontar para `powershell.exe` ou `pwsh.exe`, desde que o executável esteja instalado e acessível.

## 8. Dados salvos pelo projeto

O layout do canvas é salvo automaticamente:

- `layout.json`: workspace padrão;
- `workspaces/<nome>.json`: demais workspaces.

Esses arquivos são dados locais do usuário e estão no `.gitignore`. A pasta `.venv/` e os caches Python também são locais e não precisam ser versionados.

As sessões dos terminais ficam em memória enquanto o servidor está ativo. Recarregar a página preserva a sessão do shell, mas encerrar o processo do servidor encerra todos os shells abertos.

## 9. Encerrar e reiniciar

Para parar o servidor iniciado no terminal, pressione:

```text
Ctrl+C
```

Ao encerrar, o backend termina os processos de terminal associados. Para iniciar novamente, execute o comando escolhido nas seções anteriores e use a nova URL com token.

## 10. Problemas comuns

### `python3: command not found` ou Python incompatível

Instale Python 3.10 ou superior e confirme a versão:

```bash
python3 --version
```

No Windows, use:

```powershell
py -3 --version
```

### Erro ao criar o ambiente virtual no Linux

Instale o pacote de suporte:

```bash
sudo apt install python3-venv
```

Em outras distribuições, procure o pacote equivalente a `python3-venv`.

### `ModuleNotFoundError: aiohttp`, `ptyprocess`, `winpty` ou `webview`

Verifique se a instalação foi feita dentro do ambiente virtual correto:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

No Windows:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Para o modo desktop, confirme também a instalação das dependências GTK/WebKit no Linux.

### Porta `8765` ocupada

Escolha outra porta ao iniciar:

```bash
ATOM_CANVAS_PORT=8766 ./iniciar.sh
```

No PowerShell:

```powershell
$env:ATOM_CANVAS_PORT = "8766"
python server.py --open
```

### O navegador mostra `403` ou “token inválido”

Feche a aba antiga e abra a URL completa impressa pela execução atual do servidor. O token faz parte da autenticação de todas as requisições e muda por padrão a cada execução.

### `./iniciar.sh: Permission denied`

Conceda permissão de execução uma vez:

```bash
chmod +x iniciar.sh
```

Como alternativa, execute o script pelo Bash:

```bash
bash iniciar.sh
```

## 11. Comandos rápidos

Depois que o ambiente já estiver preparado, os comandos mais comuns são:

```bash
# Linux/macOS — navegador
./iniciar.sh

# Linux — janela desktop
./iniciar.sh --desktop

# Execução manual
.venv/bin/python server.py --open
```

No Windows, use `iniciar.bat` para o navegador ou `iniciar-desktop.bat` para a janela desktop.

Para detalhes internos sobre o backend, WebSocket, PTY, persistência e segurança, consulte [`ARQUITETURA.md`](ARQUITETURA.md).
