// ATOM Canvas — frontend v2
const TOKEN = new URLSearchParams(location.search).get("token") || "";
const $ = (s) => document.querySelector(s);
const viewport = $("#viewport"), world = $("#world"), overlay = $("#overlay");
const zoomBtn = $("#zoom"), ctx = $("#ctx"), help = $("#help");
const workspaceSelect = $("#workspaceSelect"), minimap = $("#minimap"), minimapCanvas = minimap.querySelector("canvas");

const GRID = 24;
const COLORS = ["#7c5cff", "#22d3ee", "#3ddc97", "#facc15", "#fb923c", "#ff5f6d", "#f472b6", "#94a3b8"];
const SIZES = { term: { w: 960, h: 580 }, note: { w: 320, h: 260 }, preview: { w: 640, h: 420 } };
const MIN = { w: 320, h: 180 };

const P = {
  term: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<circle cx="12" cy="12" r="4"/><path d="M3 12h4M17 12h4M12 3v4M12 17v4"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 16h16M10 4v16M16 4v16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01"/>',
  max: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  restore: '<path d="M8 8V5h11v11h-3"/><rect x="5" y="8" width="11" height="11" rx="1.5"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  min: '<path d="M6 12h12"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  restart: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  center: '<path d="M12 3v18M3 12h18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  claude: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  markdown: '<path d="M4 5h16v14H4z"/><path d="M7 15v-5l3 3 3-3v5M16 10v5M14.5 13.5L16 15l1.5-1.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-4-4L7 20"/>',
  map: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M9 5v14M15 5v14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;
document.querySelectorAll("[data-ico]").forEach((i) => (i.innerHTML = ico(i.dataset.ico)));

const TERM_THEME = {
  background: "#0a0b10", foreground: "#d6dbe8", cursor: "#a78bfa", cursorAccent: "#0a0b10",
  selectionBackground: "rgba(124,92,255,.35)",
  black: "#1b1e28", red: "#ff5f6d", green: "#3ddc97", yellow: "#facc15", blue: "#60a5fa",
  magenta: "#c084fc", cyan: "#22d3ee", white: "#d6dbe8",
  brightBlack: "#4b5266", brightRed: "#ff8a95", brightGreen: "#6ee7b7", brightYellow: "#fde68a",
  brightBlue: "#93c5fd", brightMagenta: "#d8b4fe", brightCyan: "#67e8f9", brightWhite: "#ffffff",
};

let view = { x: 0, y: 0, s: 1 };
const nodes = new Map();
let connections = [];
let zTop = 1, active = null;
let snap = localStorage.getItem("atomSnap") === "1";
let workspace = new URLSearchParams(location.search).get("workspace") || localStorage.getItem("atomWorkspace") || "default";
let connectSource = null;

const linkLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
linkLayer.classList.add("connections");
linkLayer.setAttribute("width", "1"); linkLayer.setAttribute("height", "1");
world.appendChild(linkLayer);

function renderConnections() {
  const valid = connections.filter((c) => nodes.has(c.from) && nodes.has(c.to));
  if (valid.length !== connections.length) connections = valid;
  const bounds = [...nodes.values()].reduce((b, n) => ({
    minX: Math.min(b.minX, n.data.x), minY: Math.min(b.minY, n.data.y),
    maxX: Math.max(b.maxX, n.data.x + n.data.w), maxY: Math.max(b.maxY, n.data.y + n.data.h),
  }), { minX: 0, minY: 0, maxX: innerWidth, maxY: innerHeight });
  const lw = Math.max(1, bounds.maxX - bounds.minX + 200), lh = Math.max(1, bounds.maxY - bounds.minY + 200);
  linkLayer.setAttribute("viewBox", `${bounds.minX - 100} ${bounds.minY - 100} ${lw} ${lh}`);
  Object.assign(linkLayer.style, { left: `${bounds.minX - 100}px`, top: `${bounds.minY - 100}px`, width: `${lw}px`, height: `${lh}px` });
  linkLayer.innerHTML = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>`;
  for (const c of connections) {
    const a = nodes.get(c.from)?.data, b = nodes.get(c.to)?.data;
    if (!a || !b) continue;
    const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
    const dx = Math.max(70, Math.abs(x2 - x1) * .45);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${x1 + (x2 > x1 ? dx : -dx)},${y1} ${x2 - (x2 > x1 ? dx : -dx)},${y2} ${x2},${y2}`);
    path.setAttribute("marker-end", "url(#arrow)");
    path.dataset.id = c.id; path.classList.add("connection-line");
    path.addEventListener("dblclick", () => { connections = connections.filter((x) => x.id !== c.id); renderConnections(); save(); });
    linkLayer.appendChild(path);
  }
}

function renderMinimap() {
  if (!minimap.classList.contains("on")) return;
  const ctx2 = minimapCanvas.getContext("2d"), w = minimap.clientWidth, h = minimap.clientHeight;
  minimapCanvas.width = w * devicePixelRatio; minimapCanvas.height = h * devicePixelRatio;
  ctx2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx2.clearRect(0, 0, w, h); ctx2.fillStyle = "rgba(11,13,20,.94)"; ctx2.fillRect(0, 0, w, h);
  const list = [...nodes.values()].map((n) => n.data);
  if (!list.length) return;
  const minX = Math.min(...list.map((d) => d.x)), minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w)), maxY = Math.max(...list.map((d) => d.y + d.h));
  const scale = Math.min((w - 18) / Math.max(1, maxX - minX), (h - 18) / Math.max(1, maxY - minY));
  const tx = (x) => 9 + (x - minX) * scale, ty = (y) => 9 + (y - minY) * scale;
  for (const d of list) { ctx2.fillStyle = d.color || "#7c5cff"; ctx2.globalAlpha = .8; ctx2.fillRect(tx(d.x), ty(d.y), Math.max(3, d.w * scale), Math.max(3, d.h * scale)); }
  ctx2.globalAlpha = 1; ctx2.strokeStyle = "#fff"; ctx2.lineWidth = 1;
  const r = viewport.getBoundingClientRect();
  const vx = (r.width / view.s) * scale, vy = (r.height / view.s) * scale;
  const wx = (-view.x / view.s) * scale + tx(0), wy = (-view.y / view.s) * scale + ty(0);
  ctx2.strokeRect(wx, wy, vx, vy);
}

// ================= view =================
function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  const g = GRID * view.s;
  viewport.style.backgroundSize = `${g}px ${g}px`;
  viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
  zoomBtn.textContent = Math.round(view.s * 100) + "%";
  renderConnections(); renderMinimap();
}
function toWorld(cx, cy) {
  const r = viewport.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s };
}
function zoomAt(cx, cy, factor, abs) {
  const r = viewport.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const ns = Math.min(2.5, Math.max(0.15, abs ?? view.s * factor));
  view.x = px - (px - view.x) * (ns / view.s);
  view.y = py - (py - view.y) * (ns / view.s);
  view.s = ns;
  applyView(); save();
}
const zoomCenter = (f, abs) => zoomAt(innerWidth / 2, innerHeight / 2, f, abs);

function fitAll() {
  const list = [...nodes.values()].map((n) => n.data);
  if (!list.length) return;
  const minX = Math.min(...list.map((d) => d.x)), minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w)), maxY = Math.max(...list.map((d) => d.y + (d.min ? 38 : d.h)));
  const vw = viewport.clientWidth, vh = viewport.clientHeight - 70;
  const s = Math.min(1.2, Math.max(0.15, Math.min((vw - 120) / (maxX - minX), (vh - 100) / (maxY - minY))));
  view = { s, x: (vw - (maxX - minX) * s) / 2 - minX * s, y: 70 + (vh - (maxY - minY) * s) / 2 - minY * s };
  applyView(); save();
}

const isBg = (t) => t === viewport || t === world;

viewport.addEventListener("wheel", (e) => {
  if (e.ctrlKey || isBg(e.target)) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }
}, { passive: false });

viewport.addEventListener("pointerdown", (e) => {
  hideCtx();
  if (!(isBg(e.target) || e.button === 1) || e.button === 2) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
  viewport.classList.add("panning");
  const move = (ev) => { view.x = ox + ev.clientX - sx; view.y = oy + ev.clientY - sy; applyView(); };
  const up = () => {
    viewport.classList.remove("panning");
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); save();
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
});

viewport.addEventListener("dblclick", (e) => {
  if (!isBg(e.target)) return;
  const p = toWorld(e.clientX, e.clientY);
  addNode({ type: "term", x: p.x, y: p.y });
});

// ================= persistence =================
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = { view, nodes: [...nodes.values()].map((n) => n.data), connections };
    fetch(`/api/layout?token=${TOKEN}&workspace=${encodeURIComponent(workspace)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  }, 400);
  updateStatus();
}

function updateStatus() {
  const all = [...nodes.values()];
  const terms = all.filter((n) => n.data.type === "term");
  const live = terms.filter((n) => n.ws?.readyState === 1).length;
  $("#statusText").textContent = `${terms.length} terminais · ${all.length - terms.length} notas · ${live} conectados · zoom ${Math.round(view.s * 100)}%`;
  $(".led").style.background = live === terms.length ? "" : "#facc15";
}

// ================= nodes =================
const snapV = (v) => (snap ? Math.round(v / GRID) * GRID : v);

function addNode(d) {
  const type = d.type || "term";
  const data = Object.assign({
    id: crypto.randomUUID(), type, x: 100, y: 100, ...SIZES[type],
    title: type === "note" ? "Nota" : type === "preview" ? "Preview" : "Terminal", text: "", cwd: "", url: "", mode: "browser",
    color: type === "note" ? COLORS[3] : type === "preview" ? COLORS[1] : COLORS[0], fontSize: 14, min: false,
  }, d);
  data.x = snapV(data.x); data.y = snapV(data.y);

  const el = document.createElement("div");
  el.className = `node ${type}`;
  const isTerm = type === "term";
  const isPreview = type === "preview";
  const kind = isTerm ? "term" : type === "note" ? "note" : data.mode === "markdown" ? "markdown" : data.mode === "image" ? "image" : "browser";
  el.innerHTML = `
    <header>
      <span class="dot" title="Trocar cor"></span>
      <span class="kind">${ico(kind)}</span>
      <span class="title"></span>
      <span class="cwd"></span>
      <div class="actions">
        ${isTerm ? `<button data-a="fdown" title="Diminuir fonte (Ctrl+-)" style="font-size:11px">A−</button>
        <span class="fs"></span>
        <button data-a="fup" title="Aumentar fonte (Ctrl+=)" style="font-size:13px">A+</button>
        <button data-a="restart" title="Reiniciar shell">${ico("restart")}</button>
        <button data-a="claude" title="Abrir Claude Code aqui">${ico("claude")}</button>
        <button data-a="search" title="Buscar no terminal">${ico("search")}</button>` : ""}
        <button data-a="link" title="Criar conexão">${ico("link")}</button>
        <button data-a="dup" title="Duplicar">${ico("copy")}</button>
        <button data-a="min" title="Minimizar">${ico("min")}</button>
        <button data-a="max" title="Maximizar (Alt+Enter)">${ico("max")}</button>
        <button data-a="full" title="Tela cheia (Alt+F)">${ico("full")}</button>
        <button data-a="close" class="close" title="Fechar">${ico("close")}</button>
      </div>
    </header>
    <div class="body"></div>
    <div class="rz r"></div><div class="rz b"></div><div class="rz br"></div>`;
  el.querySelector(".title").textContent = data.title;
  world.appendChild(el);

  const node = { data, el };
  nodes.set(data.id, node);
  place(node);
  focusNode(node);

  const header = el.querySelector("header");
  header.addEventListener("pointerdown", (e) => {
    if (node.maxed || e.target.closest("button, .dot") || e.target.isContentEditable) return;
    dragOp(e, (dx, dy, o) => { data.x = snapV(o.x + dx); data.y = snapV(o.y + dy); place(node); }, { x: data.x, y: data.y });
  });
  header.addEventListener("dblclick", (e) => {
    if (e.target.closest("button, .dot, .title")) return;
    setMax(node, !node.maxed);
  });

  const resizer = (fx, fy) => (e) => dragOp(e, (dx, dy, o) => {
    if (fx) data.w = Math.max(MIN.w, snapV(o.w + dx));
    if (fy) data.h = Math.max(MIN.h, snapV(o.h + dy));
    place(node);
  }, { w: data.w, h: data.h });
  el.querySelector(".rz.r").addEventListener("pointerdown", resizer(1, 0));
  el.querySelector(".rz.b").addEventListener("pointerdown", resizer(0, 1));
  el.querySelector(".rz.br").addEventListener("pointerdown", resizer(1, 1));

  const title = el.querySelector(".title");
  title.addEventListener("dblclick", (e) => { e.stopPropagation(); title.contentEditable = "true"; title.focus(); document.execCommand("selectAll"); });
  title.addEventListener("blur", () => {
    title.contentEditable = "false"; data.title = title.textContent.trim() || data.title; title.textContent = data.title; save();
  });
  title.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); title.blur(); } });

  el.querySelector(".dot").onclick = () => {
    data.color = COLORS[(COLORS.indexOf(data.color) + 1) % COLORS.length]; place(node); save();
  };

  el.querySelector(".actions").addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    if (a === "close") removeNode(node);
    else if (a === "dup") duplicate(node);
    else if (a === "min") { if (node.maxed) setMax(node, false); data.min = !data.min; place(node); save(); }
    else if (a === "max") setMax(node, !node.maxed);
    else if (a === "full") toggleFull(node);
    else if (a === "fup") setFont(node, 1);
    else if (a === "fdown") setFont(node, -1);
    else if (a === "restart") node.restart();
    else if (a === "claude") openClaude(node);
    else if (a === "search") searchTerm(node);
    else if (a === "link") beginConnection(node);
  });

  el.addEventListener("pointerdown", () => focusNode(node), true);
  el.addEventListener("click", (e) => {
    if (connectSource && !e.target.closest("button") && connectSource !== node) completeConnection(node);
  });

  if (isTerm) initTerm(node); else if (isPreview) initPreview(node); else initNote(node);
  renderConnections(); renderMinimap();
  save();
  return node;
}

function dragOp(e, fn, origin) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const sx = e.clientX, sy = e.clientY;
  document.body.style.userSelect = "none";
  const move = (ev) => fn((ev.clientX - sx) / view.s, (ev.clientY - sy) / view.s, origin);
  const up = () => {
    document.body.style.userSelect = "";
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); save();
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
}

function place({ data, el }) {
  Object.assign(el.style, { left: data.x + "px", top: data.y + "px", width: data.w + "px", height: data.h + "px" });
  el.style.setProperty("--c", data.color);
  el.classList.toggle("min", !!data.min);
  const cwd = el.querySelector(".cwd");
  const secondary = data.type === "preview" ? data.url : data.cwd;
  cwd.textContent = secondary ? secondary.split(/[\\/]/).filter(Boolean).pop() : "";
  cwd.title = secondary || "";
  const fs = el.querySelector(".fs");
  if (fs) fs.textContent = data.fontSize;
  renderConnections(); renderMinimap();
}

function focusNode(node) {
  if (active === node) return;
  active?.el.classList.remove("active");
  active = node;
  node.el.classList.add("active");
  node.el.style.zIndex = ++zTop;
}

function removeNode(node) {
  if (document.fullscreenElement === node.el) document.exitFullscreen();
  node.ws?.close();
  node.term?.dispose();
  node.ro?.disconnect();
  node.el.remove();
  nodes.delete(node.data.id);
  connections = connections.filter((c) => c.from !== node.data.id && c.to !== node.data.id);
  if (active === node) active = null;
  syncOverlay();
  renderConnections(); renderMinimap();
  save();
}

function duplicate(node) {
  const { id, sessionId, ...rest } = node.data;
  const n = addNode({ ...rest, x: rest.x + 40, y: rest.y + 40, title: rest.title + " (cópia)", min: false });
  if (node.maxed) setMax(node, false);
  return n;
}

// ---------- maximizar / tela cheia ----------
function syncOverlay() {
  overlay.classList.toggle("on", [...nodes.values()].some((n) => n.maxed));
}
function setMax(node, on) {
  if (on === !!node.maxed) return;
  if (on) nodes.forEach((n) => n !== node && n.maxed && setMax(n, false));
  node.maxed = on;
  if (on) {
    overlay.appendChild(node.el);
    node.el.classList.add("max");
    node.el.classList.remove("min");
  } else {
    node.el.classList.remove("max");
    world.appendChild(node.el);
    place(node);
  }
  const b = node.el.querySelector('[data-a="max"]');
  b.innerHTML = ico(on ? "restore" : "max");
  b.title = on ? "Restaurar (Alt+Enter)" : "Maximizar (Alt+Enter)";
  syncOverlay();
  focusNode(node);
  setTimeout(() => (node.term ? node.term.focus() : node.el.querySelector("textarea")?.focus()), 30);
}
async function toggleFull(node) {
  if (document.fullscreenElement === node.el) return document.exitFullscreen();
  node.fsRestore = !node.maxed;
  setMax(node, true);
  node.fs = true;
  try { await node.el.requestFullscreen(); } catch { node.fs = false; }
}
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) return;
  nodes.forEach((n) => {
    if (!n.fs) return;
    n.fs = false;
    if (n.fsRestore) setMax(n, false);
  });
});
overlay.addEventListener("pointerdown", (e) => {
  if (e.target === overlay) nodes.forEach((n) => n.maxed && !n.fs && setMax(n, false));
});

// ---------- nota ----------
function initNote(node) {
  const ta = document.createElement("textarea");
  ta.value = node.data.text;
  ta.placeholder = "Escreva aqui...";
  ta.spellcheck = false;
  ta.oninput = () => { node.data.text = ta.value; save(); };
  node.el.querySelector(".body").appendChild(ta);
}

function markdownToHtml(value) {
  const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let html = escape(value || "");
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  return html.split(/\n{2,}/).map((p) => p.startsWith("<h") ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function initPreview(node) {
  const body = node.el.querySelector(".body");
  const render = () => {
    body.innerHTML = "";
    if (node.data.mode === "markdown") {
      const article = document.createElement("article"); article.className = "markdown-preview";
      article.innerHTML = markdownToHtml(node.data.text); body.appendChild(article);
    } else if (node.data.mode === "image") {
      const img = document.createElement("img"); img.className = "image-preview"; img.src = node.data.url; img.alt = node.data.title; body.appendChild(img);
    } else {
      const iframe = document.createElement("iframe"); iframe.className = "browser-preview"; iframe.src = node.data.url || "about:blank"; iframe.title = node.data.title;
      iframe.sandbox.add("allow-scripts", "allow-forms", "allow-popups", "allow-same-origin"); body.appendChild(iframe);
    }
  };
  if (node.data.mode === "markdown") {
    const editor = document.createElement("textarea"); editor.className = "markdown-source"; editor.value = node.data.text; editor.placeholder = "Markdown...";
    editor.oninput = () => { node.data.text = editor.value; render(); save(); };
    body.appendChild(editor); render();
  } else render();
}

function beginConnection(node) {
  if (connectSource === node) { connectSource = null; node.el.classList.remove("connecting"); return; }
  if (connectSource) return completeConnection(node);
  connectSource = node; node.el.classList.add("connecting");
  $("#statusText").textContent = "Clique em outra janela para criar a conexão";
}

function completeConnection(node) {
  if (!connectSource || connectSource === node) return;
  const exists = connections.some((c) => c.from === connectSource.data.id && c.to === node.data.id);
  if (!exists) connections.push({ id: crypto.randomUUID(), from: connectSource.data.id, to: node.data.id });
  connectSource.el.classList.remove("connecting"); connectSource = null;
  renderConnections(); save();
}

function openClaude(node) {
  if (!node.term) return;
  node.term.focus();
  node.ws?.send(JSON.stringify({ t: "i", d: "claude\r" }));
}

function searchTerm(node) {
  if (!node.search) return;
  const query = prompt("Buscar no terminal:", "");
  if (query) node.search.findNext(query);
}

// ---------- terminal ----------
function setFont(node, delta) {
  if (!node.term) return;
  node.data.fontSize = Math.min(28, Math.max(9, node.data.fontSize + delta));
  node.term.options.fontSize = node.data.fontSize;
  place(node); node.fit(); save();
}

function initTerm(node) {
  const body = node.el.querySelector(".body");
  const term = new Terminal({
    fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
    fontSize: node.data.fontSize, lineHeight: 1.15, cursorBlink: true, cursorStyle: "bar",
    scrollback: 10000, theme: TERM_THEME,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  node.search = window.SearchAddon ? new SearchAddon.SearchAddon() : null;
  if (node.search) term.loadAddon(node.search);
  if (window.WebLinksAddon) term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(body);
  node.term = term;

  const send = (m) => node.ws?.readyState === 1 && node.ws.send(JSON.stringify(m));
  node.fit = () => {
    if (node.data.min && !node.maxed) return;
    try { fit.fit(); send({ t: "r", c: term.cols, r: term.rows }); } catch (_) {}
  };

  term.attachCustomKeyEventHandler((e) => {
    if (e.type === "keydown" && e.ctrlKey && !e.altKey && ["=", "+", "-"].includes(e.key)) {
      e.preventDefault();
      setFont(node, e.key === "-" ? -1 : 1);
      return false;
    }
    if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); return false;
    }
    return true;
  });

  const connect = () => {
    node.el.classList.remove("dead");
    node.fit();
    node.data.sessionId ||= crypto.randomUUID();
    const q = new URLSearchParams({ token: TOKEN, cols: term.cols, rows: term.rows, cwd: node.data.cwd || "", sid: node.data.sessionId });
    const ws = new WebSocket(`ws://${location.host}/ws/term?${q}`);
    node.ws = ws;
    ws.onopen = updateStatus;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === "o") term.write(m.d);
      else if (m.t === "exit") term.write("\r\n\x1b[38;5;203m● processo encerrado — clique ⟳ para reiniciar\x1b[0m\r\n");
    };
    ws.onclose = () => { if (node.ws === ws) { node.el.classList.add("dead"); updateStatus(); } };
  };
  node.restart = () => { const old = node.ws; node.ws = null; old?.close(); node.data.sessionId = crypto.randomUUID(); term.reset(); connect(); term.focus(); save(); };

  term.onData((d) => send({ t: "i", d }));
  let rt;
  node.ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(node.fit, 30); });
  node.ro.observe(body);
  connect();
}

// ================= novo nó no centro =================
function addAtCenter(type, extra = {}) {
  const { w, h } = SIZES[type];
  const c = toWorld(innerWidth / 2, innerHeight / 2 + 20);
  const k = (nodes.size % 6) * 28;
  const n = addNode({ type, x: c.x - w / 2 + k, y: c.y - h / 2 + k, ...extra });
  if (n.term) setTimeout(() => n.term.focus(), 50);
  return n;
}
function addResourceAtCenter(mode, point = null) {
  const p = point || (() => { const c = toWorld(innerWidth / 2, innerHeight / 2 + 20); return { x: c.x - SIZES.preview.w / 2, y: c.y - SIZES.preview.h / 2 }; })();
  if (mode === "markdown") {
    const text = prompt("Conteúdo Markdown:", "# Novo documento\n\nEscreva aqui...");
    if (text !== null) addNode({ type: "preview", mode, text, title: "Markdown", ...p });
  } else {
    const url = prompt(mode === "image" ? "URL da imagem:" : "URL para abrir:", "https://");
    if (url) addNode({ type: "preview", mode, url: url.trim(), title: mode === "image" ? "Imagem" : "Navegador", ...p });
  }
}
function askCwd() {
  const last = localStorage.getItem("atomLastCwd") || "";
  const cwd = prompt("Pasta inicial do terminal:", last);
  if (cwd === null) return null;
  localStorage.setItem("atomLastCwd", cwd.trim());
  return cwd.trim();
}

function clearCanvas() {
  for (const node of nodes.values()) {
    node.ws?.close(); node.term?.dispose(); node.ro?.disconnect(); node.el.remove();
  }
  nodes.clear(); connections = []; active = null; connectSource = null;
  world.appendChild(linkLayer); syncOverlay();
}

async function loadWorkspace(name) {
  workspace = name || "default";
  localStorage.setItem("atomWorkspace", workspace);
  clearCanvas();
  const res = await fetch(`/api/layout?token=${TOKEN}&workspace=${encodeURIComponent(workspace)}`);
  const layout = await res.json();
  view = layout.view || { x: 0, y: 0, s: 1 };
  connections = layout.connections || [];
  applyView();
  for (const d of layout.nodes || []) addNode(d);
  if (!nodes.size) addAtCenter("term");
  workspaceSelect.value = workspace;
  updateStatus();
}

async function loadWorkspaces() {
  const res = await fetch(`/api/workspaces?token=${TOKEN}`);
  const names = res.ok ? await res.json() : ["default"];
  if (!names.includes(workspace)) names.push(workspace);
  workspaceSelect.innerHTML = names.map((n) => `<option value="${n.replace(/"/g, "&quot;")}">${n}</option>`).join("");
  workspaceSelect.value = workspace;
}

// ================= menu de contexto =================
function hideCtx() { ctx.classList.remove("on"); }
viewport.addEventListener("contextmenu", (e) => {
  if (!isBg(e.target)) return;
  e.preventDefault();
  const p = toWorld(e.clientX, e.clientY);
  const items = [
    ["term", "Novo terminal aqui", "Alt+T", () => addNode({ type: "term", ...p })],
    ["folder", "Terminal em pasta…", "", () => { const cwd = askCwd(); if (cwd !== null) addNode({ type: "term", ...p, cwd }); }],
    ["note", "Nova nota aqui", "Alt+N", () => addNode({ type: "note", ...p })],
    ["markdown", "Preview Markdown aqui", "", () => addResourceAtCenter("markdown", p)],
    ["browser", "Navegador aqui", "", () => addResourceAtCenter("browser", p)],
    ["image", "Imagem aqui", "", () => addResourceAtCenter("image", p)],
    null,
    ["fit", "Ajustar tudo", "Alt+0", fitAll],
    ["center", "Zoom 100%", "", () => zoomAt(e.clientX, e.clientY, 1, 1)],
  ];
  ctx.innerHTML = "";
  for (const it of items) {
    if (!it) { ctx.appendChild(document.createElement("hr")); continue; }
    const b = document.createElement("button");
    b.innerHTML = `${ico(it[0])}${it[1]}<span>${it[2]}</span>`;
    b.onclick = () => { hideCtx(); it[3](); };
    ctx.appendChild(b);
  }
  ctx.classList.add("on");
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + "px";
  ctx.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + "px";
});
addEventListener("pointerdown", (e) => { if (!ctx.contains(e.target)) hideCtx(); });

// ================= toolbar =================
document.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => addAtCenter(b.dataset.add)));
const resourceMenu = $("#resourceMenu");
$("#resourceBtn").onclick = (e) => { e.stopPropagation(); resourceMenu.classList.toggle("on"); };
resourceMenu.querySelectorAll("[data-resource]").forEach((b) => b.onclick = () => { resourceMenu.classList.remove("on"); addResourceAtCenter(b.dataset.resource); });
addEventListener("pointerdown", (e) => { if (!resourceMenu.contains(e.target) && e.target !== $("#resourceBtn")) resourceMenu.classList.remove("on"); });
$("#zoomIn").onclick = () => zoomCenter(1.2);
$("#zoomOut").onclick = () => zoomCenter(1 / 1.2);
zoomBtn.onclick = () => zoomCenter(1, 1);
$("#fitAll").onclick = fitAll;
const snapBtn = $("#snap");
snapBtn.classList.toggle("on", snap);
snapBtn.onclick = () => { snap = !snap; localStorage.setItem("atomSnap", snap ? "1" : "0"); snapBtn.classList.toggle("on", snap); };
const minimapBtn = $("#minimapToggle");
minimapBtn.onclick = () => { minimap.classList.toggle("on"); minimapBtn.classList.toggle("on", minimap.classList.contains("on")); renderMinimap(); };
minimapCanvas.addEventListener("click", (e) => {
  const r = minimapCanvas.getBoundingClientRect();
  const list = [...nodes.values()].map((n) => n.data); if (!list.length) return;
  const minX = Math.min(...list.map((d) => d.x)), minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w)), maxY = Math.max(...list.map((d) => d.y + d.h));
  const scale = Math.min((r.width - 18) / Math.max(1, maxX - minX), (r.height - 18) / Math.max(1, maxY - minY));
  view.x = innerWidth / 2 - (minX + (e.clientX - r.left - 9) / scale) * view.s;
  view.y = innerHeight / 2 - (minY + (e.clientY - r.top - 9) / scale) * view.s;
  applyView(); save();
});
workspaceSelect.addEventListener("change", () => loadWorkspace(workspaceSelect.value));
$("#workspaceNew").onclick = async () => {
  const name = prompt("Nome do novo workspace:", "workspace-" + new Date().toISOString().slice(0, 10));
  if (!name?.trim()) return;
  workspace = name.trim().replace(/\s+/g, "-");
  await loadWorkspaces(); await loadWorkspace(workspace);
};
$("#helpBtn").onclick = () => help.classList.add("on");
$("#helpClose").onclick = () => help.classList.remove("on");
help.addEventListener("pointerdown", (e) => { if (e.target === help) help.classList.remove("on"); });

// ================= atalhos =================
addEventListener("keydown", (e) => {
  const typing = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.isContentEditable;
  if (e.altKey && !e.ctrlKey) {
    const k = e.key.toLowerCase();
    const map = {
      t: () => addAtCenter("term"),
      n: () => addAtCenter("note"),
      0: fitAll,
      enter: () => active && setMax(active, !active.maxed),
      f: () => active && toggleFull(active),
    };
    if (map[k]) { e.preventDefault(); e.stopPropagation(); map[k](); return; }
  }
  if (e.key === "Escape") {
    if (help.classList.contains("on")) return help.classList.remove("on");
    if (ctx.classList.contains("on")) return hideCtx();
    if (!typing) nodes.forEach((n) => n.maxed && !n.fs && setMax(n, false));
  }
  if (e.key === "?" && !typing) help.classList.add("on");
}, true);

// ================= boot =================
(async () => {
  const res = await fetch(`/api/layout?token=${TOKEN}&workspace=${encodeURIComponent(workspace)}`);
  if (!res.ok) {
    document.body.innerHTML = "<h2 style='padding:40px;font-family:system-ui;color:#e6e9f2'>Token inválido. Use a URL impressa no terminal do servidor.</h2>";
    return;
  }
  await loadWorkspaces();
  await loadWorkspace(workspace);
})();
