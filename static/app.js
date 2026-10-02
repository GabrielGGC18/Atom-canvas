// ATOM Canvas — frontend v3
const TOKEN = new URLSearchParams(location.search).get("token") || "";
const $ = (s) => document.querySelector(s);
const viewport = $("#viewport"), world = $("#world"), overlay = $("#overlay");
const zoomBtn = $("#zoom"), ctx = $("#ctx"), help = $("#help");
const workspaceSelect = $("#workspaceSelect"), minimap = $("#minimap"), minimapCanvas = minimap.querySelector("canvas");

const GRID = 24;
const HEADER_H = 38;
const COLORS = ["#7c5cff", "#22d3ee", "#3ddc97", "#facc15", "#fb923c", "#ff5f6d", "#f472b6", "#94a3b8"];
const SIZES = { term: { w: 960, h: 580 }, note: { w: 320, h: 260 }, preview: { w: 640, h: 420 } };
const MIN = { w: 320, h: 180 };
const ZOOM_MIN = 0.15, ZOOM_MAX = 2.5;
const UNDO_MS = 7000;

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
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  reload: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.5 15a7 7 0 0 0 12.4 2M18.5 9A7 7 0 0 0 6.1 7"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
document.querySelectorAll("[data-ico]").forEach((i) => (i.innerHTML = ico(i.dataset.ico)));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const TERM_THEME = {
  background: "#0b0c12", foreground: "#dde1ec", cursor: "#a78bfa", cursorAccent: "#0b0c12",
  selectionBackground: "rgba(139,92,246,.38)",
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
let workspace = sanitizeWorkspace(new URLSearchParams(location.search).get("workspace") || localStorage.getItem("atomWorkspace") || "default");
let connectSource = null;
let loading = false;

// Espelho de _workspace_name() do server.py: client e servidor concordam no nome.
function sanitizeWorkspace(value) {
  let v = String(value || "default").trim();
  if (["default", "layout"].includes(v.toLowerCase())) return "default";
  v = v.replace(/[^a-zA-Z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 64);
  return v || "default";
}

const api = (path, params = {}, opts = {}) =>
  fetch(`${path}?${new URLSearchParams({ token: TOKEN, ...params })}`, opts);

// ================= toast =================
const toasts = $("#toasts");
function toast(msg, { action, onAction, timeout = 3500, kind = "" } = {}) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span></span>`;
  el.firstChild.textContent = msg;
  let done = false;
  const close = () => { if (done) return; done = true; el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  if (action) {
    const b = document.createElement("button");
    b.textContent = action;
    b.onclick = () => { close(); onAction?.(); };
    el.appendChild(b);
  }
  toasts.appendChild(el);
  while (toasts.children.length > 4) toasts.firstElementChild.remove();
  const t = setTimeout(close, timeout);
  return { close: () => { clearTimeout(t); close(); }, el };
}

// ================= diálogo (substitui prompt/confirm) =================
const dialog = $("#dialog");
let dialogResolve = null;
function ask({ title, label = "", value = "", placeholder = "", multiline = false, suggestions = [], okText = "OK", danger = false, input = true } = {}) {
  if (dialogResolve) dialogResolve(null);
  const card = dialog.querySelector(".card");
  card.innerHTML = `
    <h3></h3>
    <label class="dlg-label"></label>
    ${input ? (multiline ? `<textarea class="dlg-input" rows="8"></textarea>` : `<input class="dlg-input" list="dlgList" autocomplete="off">`) : ""}
    <datalist id="dlgList">${suggestions.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
    <div class="dlg-actions">
      <button type="button" class="tb" data-r="cancel">Cancelar</button>
      <button type="submit" class="tb primary ${danger ? "danger" : ""}">${esc(okText)}</button>
    </div>`;
  card.querySelector("h3").textContent = title || "";
  card.querySelector(".dlg-label").textContent = label;
  const field = card.querySelector(".dlg-input");
  if (field) { field.value = value; field.placeholder = placeholder; }
  dialog.classList.add("on");
  setTimeout(() => { if (field) { field.focus(); field.select?.(); } else card.querySelector("[type=submit]").focus(); }, 20);
  return new Promise((resolve) => {
    dialogResolve = (v) => { dialogResolve = null; dialog.classList.remove("on"); resolve(v); };
    card.onsubmit = (e) => { e.preventDefault(); dialogResolve?.(field ? field.value : true); };
    card.querySelector("[data-r=cancel]").onclick = () => dialogResolve?.(null);
    if (field && multiline) field.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) card.requestSubmit(); };
  });
}
dialog.addEventListener("pointerdown", (e) => { if (e.target === dialog) dialogResolve?.(null); });
dialog.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); dialogResolve?.(null); } });

// ================= conexões =================
const linkLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
linkLayer.classList.add("connections");
world.appendChild(linkLayer);

const nodeH = (d) => (d.min ? HEADER_H : d.h);
// Ponto onde a reta centro→alvo cruza a borda da janela.
function edgePoint(d, tx, ty) {
  const cx = d.x + d.w / 2, cy = d.y + nodeH(d) / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy, side: "h" };
  const sx = dx ? (d.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (nodeH(d) / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t, side: sx < sy ? "h" : "v" };
}

function renderConnections() {
  const valid = connections.filter((c) => nodes.has(c.from) && nodes.has(c.to) && c.from !== c.to);
  if (valid.length !== connections.length) connections = valid;
  const list = [...nodes.values()].map((n) => n.data);
  const b = list.reduce((b, d) => ({
    minX: Math.min(b.minX, d.x), minY: Math.min(b.minY, d.y),
    maxX: Math.max(b.maxX, d.x + d.w), maxY: Math.max(b.maxY, d.y + d.h),
  }), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  const ox = b.minX - 200, oy = b.minY - 200, lw = b.maxX - b.minX + 400, lh = b.maxY - b.minY + 400;
  linkLayer.setAttribute("viewBox", `${ox} ${oy} ${lw} ${lh}`);
  Object.assign(linkLayer.style, { left: `${ox}px`, top: `${oy}px`, width: `${lw}px`, height: `${lh}px` });
  let html = `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10z"/></marker></defs>`;
  for (const c of connections) {
    const a = nodes.get(c.from).data, z = nodes.get(c.to).data;
    const ac = { x: a.x + a.w / 2, y: a.y + nodeH(a) / 2 }, zc = { x: z.x + z.w / 2, y: z.y + nodeH(z) / 2 };
    const p1 = edgePoint(a, zc.x, zc.y), p2 = edgePoint(z, ac.x, ac.y);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y), k = Math.min(160, Math.max(30, dist * .4));
    const c1 = p1.side === "h" ? { x: p1.x + Math.sign(p2.x - p1.x || 1) * k, y: p1.y } : { x: p1.x, y: p1.y + Math.sign(p2.y - p1.y || 1) * k };
    const c2 = p2.side === "h" ? { x: p2.x + Math.sign(p1.x - p2.x || 1) * k, y: p2.y } : { x: p2.x, y: p2.y + Math.sign(p1.y - p2.y || 1) * k };
    const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
    const hot = active && (active.data.id === c.from || active.data.id === c.to) ? " hot" : "";
    html += `<path class="connection-hit" data-id="${esc(c.id)}" d="${d}"><title>Duplo clique remove a conexão</title></path>`;
    html += `<path class="connection-line${hot}" d="${d}" marker-end="url(#arrow)" style="--lc:${esc(a.color || COLORS[1])}"/>`;
  }
  linkLayer.innerHTML = html;
}
linkLayer.addEventListener("dblclick", (e) => {
  const id = e.target.closest?.(".connection-hit")?.dataset.id;
  if (!id) return;
  e.stopPropagation();
  connections = connections.filter((x) => x.id !== id);
  scheduleRender(); save();
  toast("Conexão removida");
});

// ================= minimap =================
function mapBounds(w, h) {
  const list = [...nodes.values()].map((n) => n.data);
  if (!list.length) return null;
  const minX = Math.min(...list.map((d) => d.x)), minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w)), maxY = Math.max(...list.map((d) => d.y + nodeH(d)));
  const scale = Math.min((w - 18) / Math.max(1, maxX - minX), (h - 18) / Math.max(1, maxY - minY));
  return { list, minX, minY, scale };
}
function renderMinimap() {
  if (!minimap.classList.contains("on")) return;
  const ctx2 = minimapCanvas.getContext("2d"), w = minimapCanvas.clientWidth, h = minimapCanvas.clientHeight;
  minimapCanvas.width = w * devicePixelRatio; minimapCanvas.height = h * devicePixelRatio;
  ctx2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx2.clearRect(0, 0, w, h); ctx2.fillStyle = "rgba(7,8,12,.7)"; ctx2.fillRect(0, 0, w, h);
  const m = mapBounds(w, h);
  if (!m) return;
  const tx = (x) => 9 + (x - m.minX) * m.scale, ty = (y) => 9 + (y - m.minY) * m.scale;
  const rr = (x, y, w, h, rad) => (ctx2.roundRect ? ctx2.roundRect(x, y, w, h, rad) : ctx2.rect(x, y, w, h));
  for (const d of m.list) {
    ctx2.fillStyle = d.color || COLORS[0];
    ctx2.globalAlpha = active?.data === d ? .95 : .5;
    ctx2.beginPath();
    rr(tx(d.x), ty(d.y), Math.max(3, d.w * m.scale), Math.max(3, nodeH(d) * m.scale), 2);
    ctx2.fill();
  }
  const r = viewport.getBoundingClientRect();
  ctx2.globalAlpha = 1; ctx2.lineWidth = 1.25;
  ctx2.fillStyle = "rgba(167,139,250,.08)"; ctx2.strokeStyle = "rgba(196,181,253,.9)";
  ctx2.beginPath();
  rr(tx(-view.x / view.s), ty(-view.y / view.s), (r.width / view.s) * m.scale, (r.height / view.s) * m.scale, 3);
  ctx2.fill(); ctx2.stroke();
}
function minimapJump(e) {
  const r = minimapCanvas.getBoundingClientRect();
  const m = mapBounds(r.width, r.height);
  if (!m) return;
  view.x = innerWidth / 2 - (m.minX + (e.clientX - r.left - 9) / m.scale) * view.s;
  view.y = innerHeight / 2 - (m.minY + (e.clientY - r.top - 9) / m.scale) * view.s;
  applyView();
}
minimapCanvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  minimapJump(e);
  minimapCanvas.setPointerCapture(e.pointerId);
  const move = (ev) => minimapJump(ev);
  const up = () => { minimapCanvas.removeEventListener("pointermove", move); minimapCanvas.removeEventListener("pointerup", up); save(); };
  minimapCanvas.addEventListener("pointermove", move); minimapCanvas.addEventListener("pointerup", up);
});

// Renderização agrupada por frame: arrastar não reconstrói SVG/minimap a cada evento.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderConnections(); renderMinimap(); });
}

// ================= view =================
function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  // Duas camadas: pontos a cada célula e marcas maiores a cada 5 (some no zoom baixo).
  const g = GRID * view.s, G = g * 5;
  viewport.style.backgroundSize = `${g}px ${g}px, ${G}px ${G}px`;
  viewport.style.backgroundPosition = `${view.x}px ${view.y}px, ${view.x}px ${view.y}px`;
  viewport.style.setProperty("--dot-a", Math.min(1, Math.max(0, (view.s - 0.3) / 0.5)).toFixed(2));
  zoomBtn.textContent = Math.round(view.s * 100) + "%";
  scheduleRender(); updateStatus();
}
function toWorld(cx, cy) {
  const r = viewport.getBoundingClientRect();
  return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s };
}
function zoomAt(cx, cy, factor, abs) {
  const r = viewport.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  const ns = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, abs ?? view.s * factor));
  view.x = px - (px - view.x) * (ns / view.s);
  view.y = py - (py - view.y) * (ns / view.s);
  view.s = ns;
  applyView(); save();
}
const zoomCenter = (f, abs) => zoomAt(innerWidth / 2, innerHeight / 2, f, abs);

function fitAll() {
  const list = [...nodes.values()].filter((n) => !n.maxed).map((n) => n.data);
  if (!list.length) return;
  const minX = Math.min(...list.map((d) => d.x)), minY = Math.min(...list.map((d) => d.y));
  const maxX = Math.max(...list.map((d) => d.x + d.w)), maxY = Math.max(...list.map((d) => d.y + nodeH(d)));
  const vw = viewport.clientWidth, vh = viewport.clientHeight - 70;
  const s = Math.min(1.2, Math.max(ZOOM_MIN, Math.min((vw - 120) / (maxX - minX), (vh - 100) / (maxY - minY))));
  view = { s, x: (vw - (maxX - minX) * s) / 2 - minX * s, y: 70 + (vh - (maxY - minY) * s) / 2 - minY * s };
  applyView(); save();
}

// Centraliza uma janela na tela (sem mudar o zoom, salvo se não couber).
function centerOn(node) {
  const d = node.data, vw = viewport.clientWidth, vh = viewport.clientHeight;
  const fit = Math.min((vw - 80) / d.w, (vh - 140) / nodeH(d));
  if (fit < view.s) view.s = Math.max(ZOOM_MIN, fit);
  view.x = vw / 2 - (d.x + d.w / 2) * view.s;
  view.y = vh / 2 + 20 - (d.y + nodeH(d) / 2) * view.s;
  applyView(); save();
}

const isBg = (t) => t === viewport || t === world || t === linkLayer;

viewport.addEventListener("wheel", (e) => {
  if (e.ctrlKey || isBg(e.target)) {
    e.preventDefault();
    // deltaMode 1 = linhas (mouse em alguns sistemas); trackpad manda pixels pequenos.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-Math.max(-120, Math.min(120, dy)) * (e.ctrlKey ? 0.006 : 0.0016));
    zoomAt(e.clientX, e.clientY, factor);
  }
}, { passive: false });

viewport.addEventListener("pointerdown", (e) => {
  hideCtx();
  if (!(isBg(e.target) || e.button === 1) || e.button === 2) return;
  if (connectSource && e.button === 0) cancelConnection();
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
  const n = addNode({ type: "term", x: p.x - 40, y: p.y - 20 });
  setTimeout(() => n.term?.focus(), 50);
});

// ================= persistência =================
let saveTimer = null, saveState = "saved", saveInFlight = null;
const saveEl = $("#saveState");
function setSaveState(s) {
  saveState = s;
  saveEl.dataset.s = s;
  saveEl.textContent = { saved: "salvo", pending: "salvando…", error: "erro ao salvar" }[s];
}
function payload() {
  const list = [...nodes.values()].sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
  return { view, nodes: list.map((n) => n.data), connections };
}
function save() {
  updateStatus();
  if (loading) return;
  setSaveState("pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
async function flushSave({ keepalive = false } = {}) {
  clearTimeout(saveTimer); saveTimer = null;
  if (loading) return;
  const ws = workspace, body = JSON.stringify(payload());
  const req = api("/api/layout", { workspace: ws }, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: keepalive && body.length < 60000,
  }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    if (!saveTimer) setSaveState("saved");
  }).catch(() => {
    setSaveState("error");
    if (!keepalive) toast("Falha ao salvar o layout — o servidor está rodando?", { kind: "error", timeout: 5000 });
  });
  saveInFlight = req;
  return req;
}
addEventListener("pagehide", () => {
  if (saveTimer) flushSave({ keepalive: true });
  pendingKills.forEach((sid) => killSession(sid, true));
});

function updateStatus() {
  const all = [...nodes.values()];
  const terms = all.filter((n) => n.data.type === "term");
  const notes = all.filter((n) => n.data.type === "note").length;
  const previews = all.length - terms.length - notes;
  const live = terms.filter((n) => n.ws?.readyState === 1).length;
  const parts = [`${terms.length} terminais`, `${notes} notas`];
  if (previews) parts.push(`${previews} previews`);
  parts.push(`${live} conectados`);
  if (!connectSource) $("#statusText").textContent = parts.join(" · ");
  $(".led").dataset.s = live === terms.length ? "ok" : live ? "warn" : "down";
  document.body.classList.toggle("empty", !all.length);
}

// ================= nós =================
const snapV = (v) => (snap ? Math.round(v / GRID) * GRID : v);

function addNode(d) {
  const type = SIZES[d.type] ? d.type : "term";
  const data = Object.assign({
    id: uuid(), type, x: 100, y: 100, ...SIZES[type],
    title: type === "note" ? "Nota" : type === "preview" ? "Preview" : "Terminal", text: "", cwd: "", url: "", mode: "browser",
    color: type === "note" ? COLORS[3] : type === "preview" ? COLORS[1] : COLORS[0], fontSize: 14, min: false,
  }, d, { type });
  for (const k of ["x", "y", "w", "h", "fontSize"]) if (!Number.isFinite(+data[k])) data[k] = k === "fontSize" ? 14 : (SIZES[type][k] ?? 100);
  data.w = Math.max(MIN.w, +data.w); data.h = Math.max(MIN.h, +data.h);
  data.x = snapV(+data.x); data.y = snapV(+data.y);
  if (data.id && nodes.has(data.id)) data.id = uuid();

  const el = document.createElement("div");
  el.className = `node ${type}`;
  el.dataset.id = data.id;
  const isTerm = type === "term";
  const isPreview = type === "preview";
  const kind = isTerm ? "term" : type === "note" ? "note" : data.mode === "markdown" ? "markdown" : data.mode === "image" ? "image" : "browser";
  el.innerHTML = `
    <header>
      <span class="dot" title="Trocar cor (Shift+clique volta)"></span>
      <span class="kind">${ico(kind)}</span>
      <span class="title" title="Duplo clique para renomear"></span>
      <span class="cwd"></span>
      <div class="actions">
        ${isTerm ? `<button data-a="fdown" title="Diminuir fonte (Ctrl+-)" aria-label="Diminuir fonte" class="txt sm">A−</button>
        <span class="fs"></span>
        <button data-a="fup" title="Aumentar fonte (Ctrl+=)" aria-label="Aumentar fonte" class="txt">A+</button>
        <button data-a="search" title="Buscar no terminal (Ctrl+Shift+F)" aria-label="Buscar">${ico("search")}</button>
        <button data-a="claude" title="Abrir Claude Code aqui" aria-label="Claude Code">${ico("claude")}</button>
        <button data-a="restart" title="Reiniciar shell" aria-label="Reiniciar shell">${ico("restart")}</button>` : ""}
        ${isPreview && kind !== "markdown" ? `<button data-a="url" title="Trocar endereço" aria-label="Trocar endereço">${ico("edit")}</button>
        <button data-a="reload" title="Recarregar" aria-label="Recarregar">${ico("reload")}</button>` : ""}
        <button data-a="link" title="Criar conexão" aria-label="Conectar">${ico("link")}</button>
        <button data-a="dup" title="Duplicar" aria-label="Duplicar">${ico("copy")}</button>
        <button data-a="min" title="Minimizar" aria-label="Minimizar">${ico("min")}</button>
        <button data-a="max" title="Maximizar (Alt+Enter)" aria-label="Maximizar">${ico("max")}</button>
        <button data-a="full" title="Tela cheia (Alt+F)" aria-label="Tela cheia">${ico("full")}</button>
        <button data-a="close" class="close" title="Fechar" aria-label="Fechar">${ico("close")}</button>
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
    el.classList.add("dragging");
    dragOp(e, (dx, dy, o) => { data.x = snapV(o.x + dx); data.y = snapV(o.y + dy); place(node); }, { x: data.x, y: data.y },
      () => el.classList.remove("dragging"));
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
  title.addEventListener("dblclick", (e) => {
    e.stopPropagation(); title.contentEditable = "true"; title.focus();
    const r = document.createRange(); r.selectNodeContents(title);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  title.addEventListener("blur", () => {
    title.contentEditable = "false"; data.title = title.textContent.trim().slice(0, 120) || data.title; title.textContent = data.title; save();
  });
  title.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { title.textContent = data.title; }
    if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); title.blur(); }
  });

  el.querySelector(".dot").onclick = (e) => {
    const i = COLORS.indexOf(data.color);
    data.color = COLORS[(i + (e.shiftKey ? -1 : 1) + COLORS.length) % COLORS.length];
    place(node); save();
  };

  el.querySelector(".actions").addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    if (a === "close") closeNode(node);
    else if (a === "dup") duplicate(node);
    else if (a === "min") { if (node.maxed) setMax(node, false); data.min = !data.min; place(node); if (!data.min) node.fit?.(); save(); }
    else if (a === "max") setMax(node, !node.maxed);
    else if (a === "full") toggleFull(node);
    else if (a === "fup") setFont(node, 1);
    else if (a === "fdown") setFont(node, -1);
    else if (a === "restart") node.restart();
    else if (a === "claude") openClaude(node);
    else if (a === "search") node.openSearch?.();
    else if (a === "link") beginConnection(node);
    else if (a === "url") changeUrl(node);
    else if (a === "reload") node.render?.();
  });

  el.addEventListener("pointerdown", (e) => {
    if (connectSource && connectSource !== node && !e.target.closest("button")) {
      e.stopPropagation(); e.preventDefault();
      completeConnection(node);
      return;
    }
    focusNode(node);
  }, true);

  if (isTerm) initTerm(node); else if (isPreview) initPreview(node); else initNote(node);
  scheduleRender();
  save();
  return node;
}

function dragOp(e, fn, origin, onEnd) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const sx = e.clientX, sy = e.clientY;
  document.body.classList.add("busy");
  const move = (ev) => fn((ev.clientX - sx) / view.s, (ev.clientY - sy) / view.s, origin);
  const up = () => {
    document.body.classList.remove("busy");
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    onEnd?.(); save();
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
}

function place({ data, el }) {
  Object.assign(el.style, { left: data.x + "px", top: data.y + "px", width: data.w + "px", height: data.h + "px" });
  el.style.setProperty("--c", data.color);
  el.classList.toggle("min", !!data.min);
  const cwd = el.querySelector(".cwd");
  const secondary = data.type === "preview" ? (data.mode === "markdown" ? "" : data.url) : data.cwd;
  cwd.textContent = secondary ? (data.type === "preview" ? hostOf(secondary) : secondary.split(/[\\/]/).filter(Boolean).pop()) : "";
  cwd.title = secondary || "";
  const fs = el.querySelector(".fs");
  if (fs) fs.textContent = data.fontSize;
  scheduleRender();
}
function hostOf(url) { try { return new URL(url).host || url; } catch { return url; } }

function focusNode(node) {
  if (active === node) return;
  active?.el.classList.remove("active");
  active = node;
  node.el.classList.add("active");
  node.el.style.zIndex = ++zTop;
  scheduleRender();
}

function disposeNode(node) {
  if (document.fullscreenElement === node.el) document.exitFullscreen().catch(() => {});
  node.closing = true;
  clearTimeout(node.retryTimer);
  node.ws?.close();
  node.term?.dispose();
  node.ro?.disconnect();
  node.el.remove();
  nodes.delete(node.data.id);
  if (active === node) active = null;
  if (connectSource === node) cancelConnection();
}

// ---------- sessões de shell ----------
const pendingKills = new Set();
function killSession(sid, keepalive = false) {
  pendingKills.delete(sid);
  return api("/api/session", { sid }, { method: "DELETE", keepalive }).catch(() => {});
}

// Fecha com "Desfazer": o shell só é encerrado quando o prazo acaba.
function closeNode(node) {
  const snapshot = structuredClone(node.data);
  const links = connections.filter((c) => c.from === node.data.id || c.to === node.data.id);
  const sid = node.data.type === "term" ? node.data.sessionId : null;
  disposeNode(node);
  connections = connections.filter((c) => !links.includes(c));
  syncOverlay(); scheduleRender(); save();
  if (sid) pendingKills.add(sid);
  let undone = false;
  const label = `${snapshot.title || "Janela"} fechada`;
  toast(label, {
    action: "Desfazer", timeout: UNDO_MS,
    onAction: () => {
      undone = true;
      if (sid) pendingKills.delete(sid);
      const n = addNode(snapshot);
      connections.push(...links.filter((c) => nodes.has(c.from) && nodes.has(c.to)));
      scheduleRender(); save();
      setTimeout(() => n.term?.focus(), 50);
    },
  });
  if (sid) setTimeout(() => { if (!undone && pendingKills.has(sid)) killSession(sid); }, UNDO_MS + 300);
}

function duplicate(node) {
  if (node.maxed) setMax(node, false);
  const { id, sessionId, ...rest } = structuredClone(node.data);
  return addNode({ ...rest, x: rest.x + 40, y: rest.y + 40, title: rest.title + " (cópia)", min: false });
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
  try { await node.el.requestFullscreen(); } catch { node.fs = false; if (node.fsRestore) setMax(node, false); toast("Tela cheia indisponível aqui"); }
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
  ta.onkeydown = (e) => {
    if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); ta.oninput(); }
  };
  node.el.querySelector(".body").appendChild(ta);
}

// ---------- markdown (subset seguro: tudo é escapado antes) ----------
function inlineMd(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1">');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
function markdownToHtml(value) {
  const lines = esc(value || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [], list = null, quote = [], i = 0;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inlineMd).join("<br>")}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${x}</li>`).join("")}</${list.tag}>`); list = null; };
  const flushQuote = () => { if (quote.length) out.push(`<blockquote>${quote.map(inlineMd).join("<br>")}</blockquote>`); quote = []; };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      flushAll();
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${code.join("\n")}</code></pre>`);
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushAll(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`);
    } else if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) {
      flushAll(); out.push("<hr>");
    } else if ((m = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+()(.*)$/))) {
      flushPara(); flushQuote();
      const tag = /^\s*\d/.test(line) ? "ol" : "ul";
      if (list && list.tag !== tag) flushList();
      list ||= { tag, items: [] };
      const box = m[1] === undefined || m[1] === "" ? "" : `<input type="checkbox" disabled ${m[1].trim() ? "checked" : ""}> `;
      list.items.push(box + inlineMd(m[2]));
    } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
      flushPara(); flushList(); quote.push(m[1]);
    } else if (!line.trim()) {
      flushAll();
    } else {
      flushList(); flushQuote(); para.push(line);
    }
    i++;
  }
  flushAll();
  return out.join("");
}

function initPreview(node) {
  const body = node.el.querySelector(".body");
  let target;
  node.render = () => {
    target?.remove();
    if (node.data.mode === "markdown") {
      target = document.createElement("article"); target.className = "markdown-preview";
      target.innerHTML = markdownToHtml(node.data.text) || `<p class="muted">Nada para mostrar ainda.</p>`;
    } else if (node.data.mode === "image") {
      target = document.createElement("img"); target.className = "image-preview"; target.alt = node.data.title;
      target.onerror = () => { target.replaceWith(Object.assign(document.createElement("div"), { className: "preview-error", textContent: "Não foi possível carregar a imagem." })); };
      target.src = node.data.url;
    } else {
      target = document.createElement("iframe"); target.className = "browser-preview"; target.title = node.data.title;
      target.sandbox.add("allow-scripts", "allow-forms", "allow-popups");
      // allow-same-origin só para sites externos: uma página do próprio servidor
      // com scripts + same-origin poderia ler o token do canvas.
      if (!isSelfOrigin(node.data.url)) target.sandbox.add("allow-same-origin");
      target.referrerPolicy = "no-referrer";
      target.src = node.data.url || "about:blank";
    }
    body.appendChild(target);
  };
  if (node.data.mode === "markdown") {
    const editor = document.createElement("textarea"); editor.className = "markdown-source"; editor.value = node.data.text; editor.placeholder = "Markdown...";
    editor.spellcheck = false;
    let t;
    editor.oninput = () => { node.data.text = editor.value; clearTimeout(t); t = setTimeout(node.render, 120); save(); };
    body.appendChild(editor);
  }
  node.render();
}
function isSelfOrigin(url) { try { return new URL(url, location.href).origin === location.origin; } catch { return false; } }
function normalizeUrl(u) {
  u = (u || "").trim();
  if (!u || u === "https://" || u === "http://") return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(u) ? "http://" : "https://") + u;
  try { const p = new URL(u); return ["http:", "https:", "data:", "blob:"].includes(p.protocol) ? p.href : ""; } catch { return ""; }
}
async function changeUrl(node) {
  const url = await ask({ title: node.data.mode === "image" ? "Endereço da imagem" : "Endereço da página", value: node.data.url, placeholder: "https://…" });
  if (url === null) return;
  const clean = normalizeUrl(url);
  if (!clean) return toast("Endereço inválido", { kind: "error" });
  node.data.url = clean; place(node); node.render(); save();
}

// ---------- conexões ----------
function beginConnection(node) {
  if (connectSource === node) return cancelConnection();
  if (connectSource) return completeConnection(node);
  connectSource = node; node.el.classList.add("connecting");
  document.body.classList.add("linking");
  $("#statusText").textContent = "Clique em outra janela para conectar · Esc cancela";
}
function cancelConnection() {
  connectSource?.el.classList.remove("connecting");
  connectSource = null;
  document.body.classList.remove("linking");
  updateStatus();
}
function completeConnection(node) {
  if (!connectSource || connectSource === node) return;
  const from = connectSource.data.id, to = node.data.id;
  const exists = connections.some((c) => (c.from === from && c.to === to));
  if (!exists) connections.push({ id: uuid(), from, to });
  cancelConnection();
  focusNode(node);
  scheduleRender(); save();
  toast(exists ? "Essas janelas já estão conectadas" : "Conexão criada");
}

function openClaude(node) {
  if (!node.term) return;
  if (node.ws?.readyState !== 1) return toast("Terminal desconectado", { kind: "error" });
  node.term.focus();
  node.ws.send(JSON.stringify({ t: "i", d: "claude\r" }));
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
  const host = document.createElement("div"); host.className = "term-host"; body.appendChild(host);
  const term = new Terminal({
    fontFamily: '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace',
    fontSize: node.data.fontSize, lineHeight: 1.15, cursorBlink: true, cursorStyle: "bar",
    scrollback: 10000, theme: TERM_THEME, allowProposedApi: true,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  node.search = window.SearchAddon ? new SearchAddon.SearchAddon() : null;
  if (node.search) term.loadAddon(node.search);
  if (window.WebLinksAddon) term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(host);
  node.term = term;

  // Barra de busca embutida
  const bar = document.createElement("div");
  bar.className = "term-search";
  bar.innerHTML = `<input placeholder="Buscar…" spellcheck="false" aria-label="Buscar no terminal">
    <span class="count"></span>
    <button data-s="prev" title="Anterior (Shift+Enter)">${ico("up")}</button>
    <button data-s="next" title="Próximo (Enter)">${ico("down")}</button>
    <button data-s="close" title="Fechar (Esc)">${ico("close")}</button>`;
  body.appendChild(bar);
  const input = bar.querySelector("input"), count = bar.querySelector(".count");
  const opts = { decorations: { matchOverviewRuler: "#facc15", activeMatchColorOverviewRuler: "#22d3ee", matchBackground: "#facc1555", activeMatchBackground: "#22d3ee99" } };
  const find = (dir) => {
    if (!node.search || !input.value) { count.textContent = ""; return; }
    const ok = dir < 0 ? node.search.findPrevious(input.value, opts) : node.search.findNext(input.value, opts);
    bar.classList.toggle("miss", !ok);
    if (!ok) count.textContent = "0";
  };
  node.search?.onDidChangeResults?.((r) => { count.textContent = r && r.resultCount ? `${r.resultIndex + 1}/${r.resultCount}` : (input.value ? "0" : ""); });
  input.addEventListener("input", () => find(1));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); find(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); node.closeSearch(); }
  });
  bar.addEventListener("click", (e) => {
    const s = e.target.closest("button")?.dataset.s;
    if (s === "next") find(1); else if (s === "prev") find(-1); else if (s === "close") node.closeSearch();
  });
  node.openSearch = () => {
    if (!node.search) return toast("Busca indisponível");
    bar.classList.add("on");
    const sel = term.getSelection();
    if (sel && !sel.includes("\n")) input.value = sel;
    input.focus(); input.select();
    if (input.value) find(1);
  };
  node.closeSearch = () => { bar.classList.remove("on"); node.search?.clearDecorations(); count.textContent = ""; term.focus(); };

  // Camada de "desconectado" com ação
  const deadEl = document.createElement("div");
  deadEl.className = "term-dead";
  deadEl.innerHTML = `<div><b></b><small></small><button class="tb primary" data-d="go"></button></div>`;
  body.appendChild(deadEl);
  const showDead = (title, sub, btn) => {
    deadEl.querySelector("b").textContent = title;
    deadEl.querySelector("small").textContent = sub;
    deadEl.querySelector("button").textContent = btn;
    node.el.classList.add("dead");
  };
  deadEl.querySelector("button").onclick = () => (node.exited ? node.restart() : (node.retries = 0, connect()));

  const send = (m) => node.ws?.readyState === 1 && node.ws.send(JSON.stringify(m));
  node.fit = () => {
    if ((node.data.min && !node.maxed) || !node.el.isConnected) return;
    try {
      fit.fit();
      if (term.cols !== node.sentCols || term.rows !== node.sentRows) {
        node.sentCols = term.cols; node.sentRows = term.rows;
        send({ t: "r", c: term.cols, r: term.rows });
      }
    } catch (_) {}
  };

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    if (e.ctrlKey && !e.altKey && !e.shiftKey && ["=", "+", "-"].includes(e.key)) {
      e.preventDefault(); setFont(node, e.key === "-" ? -1 : 1); return false;
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); node.openSearch(); return false; }
    if (e.ctrlKey && !e.shiftKey && e.key === "c" && term.hasSelection()) {
      navigator.clipboard?.writeText(term.getSelection()).catch(() => {}); term.clearSelection(); return false;
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
      if (term.hasSelection()) navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
      return false;
    }
    return true;
  });

  node.retries = 0;
  const connect = () => {
    if (node.closing) return;
    clearTimeout(node.retryTimer);
    node.exited = false;
    node.el.classList.remove("dead");
    node.el.classList.add("connecting-ws");
    node.fit();
    node.data.sessionId ||= uuid();
    node.sentCols = term.cols; node.sentRows = term.rows;
    const q = new URLSearchParams({ token: TOKEN, cols: term.cols, rows: term.rows, cwd: node.data.cwd || "", sid: node.data.sessionId });
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/term?${q}`);
    node.ws = ws;
    let replay = false;
    ws.onopen = () => { node.retries = 0; node.el.classList.remove("connecting-ws"); updateStatus(); };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "hello") {
        // Reconexão: limpa a tela antes do replay para não duplicar a saída.
        if (m.resumed) { term.reset(); replay = true; }
        else if (node.hadSession) {
          // Servidor reiniciou: o shell antigo morreu e este é novo.
          term.reset();
          term.write("\x1b[2m— nova sessão (a anterior foi encerrada) —\x1b[0m\r\n");
        }
        node.hadSession = true;
      } else if (m.t === "o") {
        term.write(m.d);
        if (replay) { replay = false; setTimeout(() => term.scrollToBottom(), 0); }
      } else if (m.t === "exit") {
        node.exited = true;
      }
    };
    ws.onclose = () => {
      if (node.ws !== ws || node.closing) return;
      node.el.classList.remove("connecting-ws");
      updateStatus();
      if (node.exited) {
        term.write("\r\n\x1b[38;5;203m● processo encerrado\x1b[0m\r\n");
        showDead("Processo encerrado", "O shell terminou.", "Reiniciar shell");
        return;
      }
      // Queda inesperada (servidor reiniciou, rede): tenta reconectar com espera crescente.
      if (node.retries < 5) {
        const wait = Math.min(8000, 600 * 2 ** node.retries++);
        showDead("Reconectando…", `Tentativa ${node.retries} de 5`, "Tentar agora");
        node.retryTimer = setTimeout(connect, wait);
      } else {
        showDead("Desconectado", "O servidor não respondeu. Ele ainda está rodando?", "Reconectar");
      }
    };
  };
  node.restart = () => {
    const old = node.ws, oldSid = node.data.sessionId;
    node.ws = null; old?.close();
    if (oldSid) killSession(oldSid);
    node.data.sessionId = uuid(); node.retries = 0;
    node.hadSession = false;
    term.reset(); connect(); term.focus(); save();
  };

  term.onData((d) => send({ t: "i", d }));
  let rt;
  node.ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(node.fit, 40); });
  node.ro.observe(body);
  connect();
}

// ================= novo nó no centro =================
function addAtCenter(type, extra = {}) {
  const { w, h } = SIZES[type];
  const c = toWorld(innerWidth / 2, innerHeight / 2 + 20);
  const k = (nodes.size % 6) * 28;
  const n = addNode({ type, x: c.x - w / 2 + k, y: c.y - h / 2 + k, ...extra });
  setTimeout(() => (n.term ? n.term.focus() : n.el.querySelector("textarea")?.focus()), 50);
  return n;
}
async function addResourceAtCenter(mode, point = null) {
  const p = point || (() => { const c = toWorld(innerWidth / 2, innerHeight / 2 + 20); return { x: c.x - SIZES.preview.w / 2, y: c.y - SIZES.preview.h / 2 }; })();
  if (mode === "markdown") {
    const text = await ask({ title: "Novo documento Markdown", label: "Conteúdo (Ctrl+Enter confirma)", multiline: true, value: "# Novo documento\n\nEscreva aqui..." });
    if (text !== null) addNode({ type: "preview", mode, text, title: (text.match(/^#\s+(.+)$/m)?.[1] || "Markdown").slice(0, 60), ...p });
  } else {
    const url = await ask({ title: mode === "image" ? "Abrir imagem" : "Abrir página", label: "Endereço", placeholder: "https://…" });
    if (url === null) return;
    const clean = normalizeUrl(url);
    if (!clean) return toast("Endereço inválido", { kind: "error" });
    addNode({ type: "preview", mode, url: clean, title: mode === "image" ? "Imagem" : hostOf(clean), ...p });
  }
}
function cwdHistory() {
  try { return JSON.parse(localStorage.getItem("atomCwdHistory") || "[]").filter((x) => typeof x === "string"); } catch { return []; }
}
async function askCwd() {
  const hist = cwdHistory();
  const cwd = await ask({ title: "Terminal em pasta", label: "Pasta inicial", value: hist[0] || "", placeholder: "C:\\projetos\\app ou ~/projetos/app", suggestions: hist });
  if (cwd === null) return null;
  const v = cwd.trim();
  if (v) localStorage.setItem("atomCwdHistory", JSON.stringify([v, ...hist.filter((x) => x !== v)].slice(0, 12)));
  return v;
}

function clearCanvas() {
  for (const node of [...nodes.values()]) disposeNode(node);
  nodes.clear(); connections = []; active = null; cancelConnection();
  overlay.innerHTML = "";
  world.appendChild(linkLayer); syncOverlay();
}

async function loadWorkspace(name) {
  // Grava pendências do workspace atual antes de trocar (evita perder edições
  // ou salvar o canvas vazio por cima do novo workspace durante o carregamento).
  if (saveTimer) await flushSave();
  else await saveInFlight;
  loading = true;
  try {
    workspace = sanitizeWorkspace(name);
    localStorage.setItem("atomWorkspace", workspace);
    clearCanvas();
    const res = await api("/api/layout", { workspace });
    if (!res.ok) throw new Error(res.status);
    const layout = await res.json();
    const v = layout.view;
    view = v && [v.x, v.y, v.s].every(Number.isFinite) ? { x: v.x, y: v.y, s: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s)) } : { x: 0, y: 0, s: 1 };
    applyView();
    for (const d of layout.nodes || []) {
      try { addNode(d); } catch (err) { console.error("nó inválido ignorado", d, err); }
    }
    connections = (layout.connections || []).filter((c) => c && c.id && nodes.has(c.from) && nodes.has(c.to));
    workspaceSelect.value = workspace;
    const u = new URL(location.href); u.searchParams.set("workspace", workspace); history.replaceState(null, "", u);
  } catch (err) {
    toast("Não foi possível carregar o workspace", { kind: "error" });
  } finally {
    loading = false;
  }
  if (!nodes.size) addAtCenter("term");
  setSaveState("saved");
  scheduleRender(); updateStatus();
}

async function loadWorkspaces() {
  let names = ["default"];
  try { const res = await api("/api/workspaces"); if (res.ok) names = await res.json(); } catch {}
  if (!names.includes(workspace)) names.push(workspace);
  workspaceSelect.innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  workspaceSelect.value = workspace;
  $("#workspaceDel").disabled = workspace === "default";
}

// ================= menu de contexto =================
function hideCtx() { ctx.classList.remove("on"); }
function showMenu(e, items) {
  ctx.innerHTML = "";
  for (const it of items) {
    if (!it) { ctx.appendChild(document.createElement("hr")); continue; }
    const b = document.createElement("button");
    b.innerHTML = `${ico(it[0])}<em></em><span>${esc(it[2])}</span>`;
    b.querySelector("em").textContent = it[1];
    if (it[4]) b.classList.add("danger");
    b.onclick = () => { hideCtx(); it[3](); };
    ctx.appendChild(b);
  }
  ctx.classList.add("on");
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(8, Math.min(e.clientX, innerWidth - r.width - 8)) + "px";
  ctx.style.top = Math.max(8, Math.min(e.clientY, innerHeight - r.height - 8)) + "px";
}
viewport.addEventListener("contextmenu", (e) => {
  const header = e.target.closest?.(".node header");
  if (header && !e.target.isContentEditable) {
    e.preventDefault();
    const node = nodes.get(header.parentElement.dataset.id);
    if (!node) return;
    const isTerm = node.data.type === "term";
    showMenu(e, [
      ["center", "Centralizar", "", () => centerOn(node)],
      ["edit", "Renomear", "", () => node.el.querySelector(".title").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))],
      ["copy", "Duplicar", "", () => duplicate(node)],
      ["link", "Conectar a…", "", () => beginConnection(node)],
      ...(isTerm ? [["restart", "Reiniciar shell", "", () => node.restart()]] : []),
      null,
      ["close", "Fechar", "", () => closeNode(node), true],
    ]);
    return;
  }
  if (!isBg(e.target)) return;
  e.preventDefault();
  const p = toWorld(e.clientX, e.clientY);
  showMenu(e, [
    ["term", "Novo terminal aqui", "Alt+T", () => { const n = addNode({ type: "term", ...p }); setTimeout(() => n.term?.focus(), 50); }],
    ["folder", "Terminal em pasta…", "", async () => { const cwd = await askCwd(); if (cwd !== null) addNode({ type: "term", ...p, cwd }); }],
    ["note", "Nova nota aqui", "Alt+N", () => addNode({ type: "note", ...p })],
    ["markdown", "Preview Markdown aqui", "", () => addResourceAtCenter("markdown", p)],
    ["browser", "Navegador aqui", "", () => addResourceAtCenter("browser", p)],
    ["image", "Imagem aqui", "", () => addResourceAtCenter("image", p)],
    null,
    ["fit", "Ajustar tudo", "Alt+0", fitAll],
    ["center", "Zoom 100%", "", () => zoomAt(e.clientX, e.clientY, 1, 1)],
  ]);
});
addEventListener("pointerdown", (e) => { if (!ctx.contains(e.target)) hideCtx(); });

// ================= toolbar =================
document.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => addAtCenter(b.dataset.add)));
const resourceMenu = $("#resourceMenu"), resourceBtn = $("#resourceBtn");
resourceBtn.onclick = (e) => {
  e.stopPropagation();
  const on = !resourceMenu.classList.contains("on");
  if (on) {
    const r = resourceBtn.getBoundingClientRect();
    resourceMenu.style.left = r.left + "px"; resourceMenu.style.top = r.bottom + 8 + "px";
  }
  resourceMenu.classList.toggle("on", on);
  resourceBtn.setAttribute("aria-expanded", on);
};
resourceMenu.querySelectorAll("[data-resource]").forEach((b) => b.onclick = () => { resourceMenu.classList.remove("on"); addResourceAtCenter(b.dataset.resource); });
addEventListener("pointerdown", (e) => { if (!resourceMenu.contains(e.target) && !resourceBtn.contains(e.target)) resourceMenu.classList.remove("on"); });
$("#zoomIn").onclick = () => zoomCenter(1.2);
$("#zoomOut").onclick = () => zoomCenter(1 / 1.2);
zoomBtn.onclick = () => zoomCenter(1, 1);
$("#fitAll").onclick = fitAll;
const snapBtn = $("#snap");
snapBtn.classList.toggle("on", snap);
snapBtn.onclick = () => { snap = !snap; localStorage.setItem("atomSnap", snap ? "1" : "0"); snapBtn.classList.toggle("on", snap); toast(snap ? "Encaixe na grade ligado" : "Encaixe na grade desligado"); };
const minimapBtn = $("#minimapToggle");
const setMinimap = (on) => { minimap.classList.toggle("on", on); minimapBtn.classList.toggle("on", on); localStorage.setItem("atomMinimap", on ? "1" : "0"); renderMinimap(); };
minimapBtn.onclick = () => setMinimap(!minimap.classList.contains("on"));
setMinimap(localStorage.getItem("atomMinimap") === "1");
workspaceSelect.addEventListener("change", async () => { await loadWorkspace(workspaceSelect.value); await loadWorkspaces(); });
$("#workspaceNew").onclick = async () => {
  const name = await ask({ title: "Novo workspace", label: "Nome (letras, números, - e _)", value: "workspace-" + new Date().toISOString().slice(0, 10) });
  if (!name?.trim()) return;
  const clean = sanitizeWorkspace(name);
  if (clean !== name.trim()) toast(`Nome ajustado para "${clean}"`);
  await loadWorkspace(clean);
  await flushSave();
  await loadWorkspaces();
};
$("#workspaceDel").onclick = async () => {
  if (workspace === "default") return;
  const ok = await ask({ title: `Excluir workspace "${workspace}"?`, label: "O layout salvo será apagado. Shells abertos neste workspace serão encerrados.", input: false, okText: "Excluir", danger: true });
  if (!ok) return;
  const victim = workspace;
  const sids = [...nodes.values()].map((n) => n.data.sessionId).filter(Boolean);
  clearTimeout(saveTimer); saveTimer = null;
  loading = true;  // nada de salvar o workspace que está sendo apagado
  clearCanvas();
  sids.forEach((s) => killSession(s));
  const res = await api("/api/workspaces", { workspace: victim }, { method: "DELETE" }).catch(() => null);
  loading = false;
  if (!res?.ok) toast("Falha ao excluir o workspace", { kind: "error" });
  else toast(`Workspace "${victim}" excluído`);
  await loadWorkspace("default");
  await loadWorkspaces();
};
$("#helpBtn").onclick = () => help.classList.add("on");
$("#helpClose").onclick = () => help.classList.remove("on");
help.addEventListener("pointerdown", (e) => { if (e.target === help) help.classList.remove("on"); });

// Navega entre janelas na ordem visual (esquerda→direita, cima→baixo).
function cycleFocus(dir) {
  const list = [...nodes.values()].sort((a, b) => (a.data.y - b.data.y) || (a.data.x - b.data.x));
  if (!list.length) return;
  const i = list.indexOf(active);
  const next = list[(i + dir + list.length) % list.length];
  focusNode(next); centerOn(next);
  setTimeout(() => (next.term ? next.term.focus() : next.el.querySelector("textarea")?.focus()), 30);
}

// ================= atalhos =================
addEventListener("keydown", (e) => {
  if (dialog.classList.contains("on")) return;
  const el = document.activeElement;
  const typing = el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || el?.isContentEditable;
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    const map = {
      t: () => addAtCenter("term"),
      n: () => addAtCenter("note"),
      0: fitAll,
      enter: () => active && setMax(active, !active.maxed),
      f: () => active && toggleFull(active),
      "]": () => cycleFocus(1),
      "[": () => cycleFocus(-1),
    };
    if (map[k]) { e.preventDefault(); e.stopPropagation(); map[k](); return; }
  }
  if (e.key === "Escape") {
    if (help.classList.contains("on")) return help.classList.remove("on");
    if (ctx.classList.contains("on")) return hideCtx();
    if (resourceMenu.classList.contains("on")) return resourceMenu.classList.remove("on");
    if (connectSource) return cancelConnection();
    if (!typing) nodes.forEach((n) => n.maxed && !n.fs && setMax(n, false));
  }
  if (e.key === "?" && !typing) { e.preventDefault(); help.classList.add("on"); }
}, true);

addEventListener("resize", () => scheduleRender());

// ================= boot =================
(async () => {
  let res;
  try { res = await api("/api/health"); } catch { res = null; }
  if (!res?.ok) {
    $("#fatal").classList.add("on");
    $("#fatal p").textContent = res ? "Token inválido. Abra a URL impressa no terminal do servidor (com ?token=…)." : "Servidor não respondeu. Inicie com python server.py.";
    return;
  }
  await loadWorkspaces();
  await loadWorkspace(workspace);
  await loadWorkspaces();
})();

// Exposto para testes E2E e depuração no console.
window.__atom = { nodes, get connections() { return connections; }, get view() { return view; }, get workspace() { return workspace; }, markdownToHtml, sanitizeWorkspace, flushSave };
