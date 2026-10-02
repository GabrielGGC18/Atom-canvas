// E2E do ATOM Canvas: sobe servidor isolado (dados temporários), dirige o Chrome.
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

// Uso: cd tests/e2e && npm install && node e2e.js
//   ATOM_PY=<python com aiohttp/pywinpty>  CHROME=<caminho do chrome/edge>
const REPO = path.resolve(__dirname, "..", "..");
const PY = process.env.ATOM_PY || (process.platform === "win32" ? "python" : "python3");
const CHROME = process.env.CHROME || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
const PORT = 8799, TOKEN = "e2e-token";
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "atom-e2e-"));
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(os.tmpdir(), "atom-e2e-shots"); fs.mkdirSync(SHOTS, { recursive: true });

let server;
function startServer() {
  server = spawn(PY, ["server.py"], { cwd: REPO, env: { ...process.env, ATOM_CANVAS_DATA: DATA, ATOM_CANVAS_PORT: PORT, ATOM_CANVAS_TOKEN: TOKEN, PYTHONUNBUFFERED: "1" } });
  server.stderr.on("data", (d) => process.stderr.write("[srv] " + d));
  return waitUp();
}
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${BASE}/api/health?token=${TOKEN}`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("servidor não subiu");
}
const api = async (p) => (await fetch(`${BASE}${p}${p.includes("?") ? "&" : "?"}token=${TOKEN}`)).json();

let pass = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); pass++; console.log("  ✓", name); }
  catch (e) { fail++; console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assert"); };
const termText = (page, idx = 0) => page.evaluate((i) => {
  const n = window.__atom && [...__atom.nodes.values()].filter((n) => n.term)[i];
  if (!n) return "";
  const b = n.term.buffer.active; let s = "";
  for (let y = 0; y < b.length; y++) s += b.getLine(y).translateToString(true) + "\n";
  return s;
}, idx);
async function waitFor(fn, ms = 15000, msg = "timeout") {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(msg);
}

(async () => {
  await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  console.log("E2E ATOM Canvas");
  await page.goto(`${BASE}/?token=${TOKEN}`);

  await step("boot cria terminal e conecta", async () => {
    await waitFor(() => page.evaluate(() => [...__atom.nodes.values()].some((n) => n.ws?.readyState === 1)), 15000, "ws não conectou");
    await waitFor(async () => (await page.textContent("#statusText")).includes("1 conectados"));
  });

  await step("terminal executa comando", async () => {
    await page.click(".node.term .xterm");
    await page.keyboard.type(process.platform === "win32" ? "echo ('E2E' + (40+2) + 'OK')\r" : "echo E2E$((40+2))OK\r");
    await waitFor(async () => (await termText(page)).includes("E2E42OK"), 15000, "saída não apareceu");
  });

  await step("layout salvo no disco", async () => {
    await waitFor(async () => (await page.textContent("#saveState")) === "salvo");
    const l = await api("/api/layout?workspace=default");
    assert(l.nodes.length === 1 && l.nodes[0].sessionId, "layout não salvo");
  });

  await step("reload retoma a mesma sessão (replay sem duplicar)", async () => {
    await page.reload();
    await waitFor(async () => (await termText(page)).includes("E2E42OK"), 15000, "replay faltou");
    const t = await termText(page);
    const hits = t.split("E2E42OK").length - 1;
    assert(hits <= 2, `saída duplicada (${hits})`); // linha do comando ecoado + resultado
    assert((await api("/api/health")).sessions === 1, "sessões != 1");
  });

  await step("nota: Alt+N cria e texto persiste", async () => {
    await page.click("#viewport", { position: { x: 30, y: 400 } });
    await page.keyboard.press("Alt+n");
    await page.waitForSelector(".node.note textarea");
    await page.fill(".node.note textarea", "lembrete importante");
    await waitFor(async () => (await api("/api/layout?workspace=default")).nodes.some((n) => n.text === "lembrete importante"), 5000, "nota não salva");
  });

  await step("arrastar janela pelo header", async () => {
    await page.evaluate(() => { const n = [...__atom.nodes.values()].find((n) => n.data.type === "note"); const t = [...__atom.nodes.values()].find((n) => n.term); n.data.x = t.data.x + t.data.w + 80; n.data.y = t.data.y; n.el.style.left = n.data.x + "px"; n.el.style.top = n.data.y + "px"; });
    await page.keyboard.press("Alt+0");
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => [...__atom.nodes.values()].find((n) => n.data.type === "note").data.x);
    const s = await page.evaluate(() => __atom.view.s);
    const box = await (await page.$(".node.note header .kind")).boundingBox();
    await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 5 }); await page.mouse.up();
    const after = await page.evaluate(() => [...__atom.nodes.values()].find((n) => n.data.type === "note").data.x);
    assert(Math.abs((after - before) - 36 / s) < 2, `drag ${before}→${after} s=${s}`);
  });

  await step("CSS da nota válido (fonte de UI, não monospace)", async () => {
    const ff = await page.$eval(".node.note textarea", (t) => getComputedStyle(t).fontFamily);
    assert(/Segoe|system-ui|Inter/.test(ff), ff);
  });

  await step("conexão entre janelas", async () => {
    await page.click(".node.note [data-a=link]", { force: true });
    assert((await page.textContent("#statusText")).includes("Clique em outra janela"));
    await page.click(".node.term header .title");
    await waitFor(() => page.evaluate(() => __atom.connections.length === 1));
    // a linha é desenhada no próximo frame (scheduleRender usa rAF)
    await waitFor(async () => !!(await page.$(".connection-line")), 3000, "linha não desenhada");
  });

  await step("Esc cancela modo conexão", async () => {
    await page.click(".node.note [data-a=link]", { force: true });
    await page.keyboard.press("Escape");
    assert(!(await page.$("body.linking")), "ainda em modo conexão");
  });

  await step("fechar com Desfazer restaura janela e conexão", async () => {
    await page.click(".node.note [data-a=close]", { force: true });
    await page.waitForSelector(".toast button");
    assert(!(await page.$(".node.note")), "nota não fechou");
    await page.click(".toast button");
    await page.waitForSelector(".node.note");
    assert((await page.inputValue(".node.note textarea")) === "lembrete importante");
    assert(await page.evaluate(() => __atom.connections.length === 1), "conexão não voltou");
  });

  await step("fechar terminal encerra o shell no servidor após o prazo", async () => {
    await page.keyboard.press("Alt+t");
    await waitFor(async () => (await api("/api/health")).sessions === 2, 15000, "2º shell não abriu");
    const btns = await page.$$(".node.term [data-a=close]");
    await btns[btns.length - 1].click({ force: true });
    await waitFor(async () => (await api("/api/health")).sessions === 1, 12000, "shell órfão continua vivo");
  });

  await step("reiniciar shell não deixa órfão", async () => {
    await page.click(".node.term [data-a=restart]", { force: true });
    await waitFor(() => page.evaluate(() => [...__atom.nodes.values()].some((n) => n.ws?.readyState === 1)));
    await new Promise((r) => setTimeout(r, 800));
    assert((await api("/api/health")).sessions === 1, "sessão antiga não morreu");
  });

  await step("busca embutida no terminal (Ctrl+Shift+F)", async () => {
    await page.click(".node.term .xterm");
    await page.keyboard.type("echo PROCURA-ME\r");
    await waitFor(async () => (await termText(page)).includes("PROCURA-ME"));
    await page.keyboard.press("Control+Shift+F");
    await page.waitForSelector(".term-search.on input");
    await page.keyboard.type("PROCURA-ME");
    await page.keyboard.press("Enter");
    assert(await page.evaluate(() => [...__atom.nodes.values()].find((n) => n.term).term.hasSelection()), "não encontrou");
    await page.keyboard.press("Escape");
    assert(!(await page.$(".term-search.on")), "barra não fechou");
  });

  await step("markdown: render rico e seguro", async () => {
    const html = await page.evaluate(() => __atom.markdownToHtml("# T\n- a\n- [x] b\n\n> q\n\n```\n<b>x</b>\n```\n[l](javascript:alert(1)) [ok](https://a.b) <script>alert(1)</script> **n** *i*"));
    assert(html.includes("<h1>T</h1>") && html.includes("<ul>") && html.includes("checked") && html.includes("<blockquote>"), html);
    assert(html.includes("&lt;b&gt;x&lt;/b&gt;") && !html.includes("<script>") && !html.includes('href="javascript'), html);
    assert(html.includes('href="https://a.b"') && html.includes("<strong>n</strong>") && html.includes("<em>i</em>"), html);
  });

  await step("preview Markdown via diálogo próprio (sem prompt nativo)", async () => {
    let nativeDialog = false; page.once("dialog", (d) => { nativeDialog = true; d.dismiss(); });
    await page.click("#resourceBtn");
    await page.click("[data-resource=markdown]");
    await page.waitForSelector("#dialog.on textarea");
    await page.fill("#dialog textarea", "# Meu Doc\n\n- item");
    await page.keyboard.press("Control+Enter");
    await page.waitForSelector(".markdown-preview h1");
    assert(!nativeDialog, "usou prompt nativo");
    assert((await page.textContent(".node.preview .title")) === "Meu Doc");
    await page.click(".node.preview [data-a=close]");
    await page.waitForSelector(".node.preview", { state: "detached" });
    await page.keyboard.press("Alt+0");
  });

  await step("URL inválida recusada com aviso", async () => {
    await page.click("#resourceBtn");
    await page.click("[data-resource=browser]");
    await page.fill("#dialog input", "javascript:alert(1)");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".toast.error");
    assert((await page.$$(".node.preview")).length === 0);
  });

  await step("renomear pelo título", async () => {
    await page.dblclick(".node.note .title");
    await page.keyboard.type("Ideias");
    await page.keyboard.press("Enter");
    assert((await page.textContent(".node.note .title")) === "Ideias");
  });

  await step("maximizar / restaurar (Alt+Enter, Esc)", async () => {
    await page.click(".node.note textarea");
    await page.keyboard.press("Alt+Enter");
    assert(await page.$(".node.note.max"), "não maximizou");
    await page.click("#overlay", { position: { x: 5, y: 900 } });
    assert(!(await page.$(".node.max")), "não restaurou");
  });

  await step("zoom, ajustar tudo e minimap", async () => {
    const z0 = parseInt(await page.textContent("#zoom"));
    await page.click("#zoomIn");
    const z1 = parseInt(await page.textContent("#zoom"));
    assert(Math.abs(z1 - Math.min(250, z0 * 1.2)) <= 1, `${z0}→${z1}`);
    await page.keyboard.press("Alt+0");
    await page.click("#minimapToggle");
    assert(await page.$("#minimap.on"));
    await page.mouse.click(1500 - 14 - 105, 920 - 14 - 70);
  });

  await step("workspace novo, isolado, e exclusão", async () => {
    await page.click("#workspaceNew");
    await page.fill("#dialog input", "Teste E2E.v2");
    await page.keyboard.press("Enter");
    await waitFor(() => page.evaluate(() => __atom.workspace === "Teste-E2Ev2"), 8000, "não trocou de workspace");
    await waitFor(async () => (await api("/api/workspaces")).includes("Teste-E2Ev2"), 8000, "não listado");
    assert((await page.$$(".node")).length === 1, "workspace novo não está limpo");
    assert((await page.inputValue("#workspaceSelect")) === "Teste-E2Ev2");
    const def = await api("/api/layout?workspace=default");
    assert(def.nodes.length === 2, `default alterado: ${def.nodes.length} nós`);
    await page.click("#workspaceDel");
    await page.click("#dialog [type=submit]");
    await waitFor(() => page.evaluate(() => __atom.workspace === "default"), 8000);
    assert(!(await api("/api/workspaces")).includes("Teste-E2Ev2"), "não excluiu");
    await waitFor(async () => (await page.$$(".node")).length === 2, 8000, "default não recarregou");
  });

  await step("queda do servidor → reconecta sozinho", async () => {
    server.kill();
    await page.waitForSelector(".node.term.dead", { timeout: 10000 });
    await startServer();
    await waitFor(() => page.evaluate(() => [...__atom.nodes.values()].some((n) => n.ws?.readyState === 1)), 20000, "não reconectou");
    assert(!(await page.$(".node.term.dead")), "overlay de desconectado ficou");
  });

  await step("visual: screenshot e toolbar responsiva", async () => {
    await page.keyboard.press("Alt+0");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "canvas.png") });
    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(200);
    const tb = await page.$eval("#toolbar", (t) => t.getBoundingClientRect().width);
    assert(tb <= 900, "toolbar estoura: " + tb);
    await page.screenshot({ path: path.join(SHOTS, "narrow.png") });
    await page.setViewportSize({ width: 1500, height: 920 });
    await page.click("#helpBtn"); await page.screenshot({ path: path.join(SHOTS, "help.png") }); await page.keyboard.press("Escape");
  });

  await step("token inválido mostra tela de erro", async () => {
    const p2 = await browser.newPage();
    await p2.goto(`${BASE}/?token=errado`);
    await p2.waitForSelector("#fatal.on");
    await p2.close();
  });

  await step("sem erros JS no console", async () => {
    const real = errors.filter((e) => !/ERR_CONNECTION_REFUSED|WebSocket connection|Failed to load resource/.test(e));
    assert(!real.length, real.join(" | "));
  });

  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server?.kill(); process.exit(2); });
