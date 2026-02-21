// GitHub Pages-only: read from tree.json
const API_TREE = "tree.json";

const contentEl = document.getElementById("content");
const countLabel = document.getElementById("countLabel");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const sortBy = document.getElementById("sortBy");
const viewGridBtn = document.getElementById("viewGridBtn");
const viewListBtn = document.getElementById("viewListBtn");
const loadingEl = document.getElementById("loading");
const breadcrumbEl = document.getElementById("breadcrumb");
const detailsPanel = document.getElementById("detailsPanel");
const quickFolders = document.getElementById("quickFolders");
const darkToggle = document.getElementById("darkToggle");

const ctxMenu = document.getElementById("ctxMenu");

const previewModal = document.getElementById("previewModal");
const previewTitle = document.getElementById("previewTitle");
const previewMeta = document.getElementById("previewMeta");
const previewBody = document.getElementById("previewBody");
const closePreviewBtn = document.getElementById("closePreviewBtn");
const openNewTabBtn = document.getElementById("openNewTabBtn");
const downloadBtn = document.getElementById("downloadBtn");

let treeRoot = null;
let currentPath = "";
let viewMode = "grid";
let flatIndex = new Map();
let selectedIds = new Set();
let lastClickedId = null;
let activeCtxItemId = null;

// -------- utils --------
function bytesToSize(bytes = 0) {
  const sizes = ["B", "KB", "MB", "GB"];
  if (!bytes) return "";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
function escapeHtml(str="") {
  return str.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}
function icon(kind) {
  const base = "h-10 w-10 rounded-xl grid place-items-center text-lg shrink-0 ";
  switch (kind) {
    case "folder": return `<div class="${base} bg-slate-100 dark:bg-slate-800">📁</div>`;
    case "image": return `<div class="${base} bg-emerald-100 dark:bg-emerald-900/40">🖼️</div>`;
    case "video": return `<div class="${base} bg-purple-100 dark:bg-purple-900/40">🎬</div>`;
    case "pdf": return `<div class="${base} bg-red-100 dark:bg-red-900/40">📄</div>`;
    case "app": return `<div class="${base} bg-yellow-100 dark:bg-yellow-900/40">🧩</div>`;
    case "file": return `<div class="${base} bg-blue-100 dark:bg-blue-900/40">📄</div>`;
    default: return `<div class="${base} bg-slate-100 dark:bg-slate-800">📦</div>`;
  }
}

function buildIndex(node) {
  if (!node) return;
  flatIndex.set(node.id, node);
  if (node.children) node.children.forEach(buildIndex);
}
function findNodeByRelPath(relPath) {
  return flatIndex.get(relPath) || null;
}
function getCurrentFolder() {
  if (!currentPath) return treeRoot;
  return findNodeByRelPath(currentPath);
}
function getBreadcrumbParts() {
  if (!currentPath) return [{ name: "My Drive", path: "" }];
  const parts = [{ name: "My Drive", path: "" }];
  const segs = currentPath.split("/").filter(Boolean);
  let acc = "";
  for (const s of segs) {
    acc = acc ? `${acc}/${s}` : s;
    parts.push({ name: s, path: acc });
  }
  return parts;
}
function getFilters() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const t = typeFilter.value || "all";
  const s = sortBy.value || "name_asc";
  return { q, t, s };
}
function applySort(list, sortKey) {
  const copy = [...list];
  if (sortKey === "name_asc") copy.sort((a,b)=>a.name.localeCompare(b.name));
  if (sortKey === "name_desc") copy.sort((a,b)=>b.name.localeCompare(a.name));
  if (sortKey === "modified_desc") copy.sort((a,b)=>new Date(b.modified||0)-new Date(a.modified||0));
  if (sortKey === "modified_asc") copy.sort((a,b)=>new Date(a.modified||0)-new Date(b.modified||0));
  return copy;
}
function filteredChildren(folderNode) {
  const { q, t, s } = getFilters();
  let list = (folderNode?.children || []);
  if (t !== "all") list = list.filter(x => x.kind === t);
  if (q) list = list.filter(x => (x.name || "").toLowerCase().includes(q));
  return applySort(list, s);
}

function setLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
  contentEl.classList.toggle("hidden", on);
}

// -------- render --------
function renderBreadcrumb() {
  const parts = getBreadcrumbParts();
  breadcrumbEl.innerHTML = parts.map((p, idx) => {
    const isLast = idx === parts.length - 1;
    return `
      <button data-bc="${escapeHtml(p.path)}"
        class="max-w-[280px] truncate ${isLast ? "text-slate-900 dark:text-slate-100" : "text-blue-600 dark:text-blue-400 hover:underline"}">
        ${escapeHtml(p.name)}
      </button>
      ${isLast ? "" : `<span class="text-slate-400">/</span>`}
    `;
  }).join("");

  breadcrumbEl.querySelectorAll("[data-bc]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPath = btn.getAttribute("data-bc") || "";
      selectedIds.clear();
      lastClickedId = null;
      render();
    });
  });
}

function renderQuickFolders() {
  const top = treeRoot?.children || [];
  quickFolders.innerHTML = top.map(n => `
    <button data-qf="${escapeHtml(n.relPath)}" class="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
      ${icon("folder")}
      <div class="text-left">
        <div class="font-medium">${escapeHtml(n.name)}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${(n.children?.length || 0)} items</div>
      </div>
    </button>
  `).join("");

  quickFolders.querySelectorAll("[data-qf]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPath = btn.getAttribute("data-qf") || "";
      selectedIds.clear();
      lastClickedId = null;
      render();
    });
  });
}

function renderDetails(item) {
  const isExe = item.kind === "app";
  detailsPanel.innerHTML = `
    <div class="flex items-center gap-3 mb-3">
      ${icon(item.kind)}
      <div class="min-w-0">
        <div class="font-semibold truncate">${escapeHtml(item.name)}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${item.kind.toUpperCase()} ${item.ext || ""}</div>
      </div>
    </div>

    <div class="space-y-2">
      <div><span class="text-slate-500 dark:text-slate-400">Modified:</span> ${fmtDate(item.modified)}</div>
      <div><span class="text-slate-500 dark:text-slate-400">Size:</span> ${item.size ? bytesToSize(item.size) : "—"}</div>
      <div class="break-all"><span class="text-slate-500 dark:text-slate-400">Path:</span> ${escapeHtml(item.relPath || "/")}</div>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button class="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" id="dtPreview">Preview</button>
      <button class="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" id="dtNewtab">New tab</button>
      <button class="px-3 py-2 rounded-lg ${isExe ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"} text-white text-sm" id="dtDownload">
        ${isExe ? "Download (confirm)" : "Download"}
      </button>
    </div>
  `;
  document.getElementById("dtPreview")?.addEventListener("click", () => openPreview(item));
  document.getElementById("dtNewtab")?.addEventListener("click", () => openInNewTab(item));
  document.getElementById("dtDownload")?.addEventListener("click", () => downloadItem(item));
}

function render() {
  hideCtxMenu();
  renderBreadcrumb();

  const folder = getCurrentFolder();
  const list = filteredChildren(folder);

  countLabel.textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;

  if (viewMode === "grid") renderGrid(list);
  else renderList(list);

  if (selectedIds.size === 1) {
    const only = [...selectedIds][0];
    const n = flatIndex.get(only);
    if (n) renderDetails(n);
  } else if (selectedIds.size > 1) {
    detailsPanel.innerHTML = `
      <div class="font-medium mb-1">${selectedIds.size} selected</div>
      <div class="text-xs text-slate-500 dark:text-slate-400">Bulk ZIP download is disabled in GitHub Pages-only mode.</div>
    `;
  } else {
    detailsPanel.textContent = "Select a file to see details.";
  }
}

function cardGrid(item) {
  const isSelected = selectedIds.has(item.id);
  return `
    <div class="group rounded-2xl border ${isSelected ? "border-blue-500 ring-2 ring-blue-200/40" : "border-slate-200 dark:border-slate-800"} bg-white dark:bg-slate-900 p-3 hover:shadow-sm transition no-select"
      data-id="${escapeHtml(item.id)}">
      <div class="flex items-start justify-between gap-2">
        ${icon(item.kind)}
        <button class="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" data-more="${escapeHtml(item.id)}">⋮</button>
      </div>

      <div class="mt-3">
        <div class="font-medium line-clamp-1">${escapeHtml(item.name)}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          ${item.kind.toUpperCase()} • ${fmtDate(item.modified)}
        </div>
      </div>
    </div>
  `;
}
function renderGrid(list) {
  contentEl.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      ${list.map(cardGrid).join("")}
    </div>
  `;
  bindItemEvents(list);
}

function rowList(item) {
  const isSelected = selectedIds.has(item.id);
  return `
    <div class="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isSelected ? "bg-blue-50/70 dark:bg-blue-900/20" : ""}"
      data-id="${escapeHtml(item.id)}">
      <div class="col-span-7 flex items-center gap-3">
        ${icon(item.kind)}
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(item.name)}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">${item.kind.toUpperCase()} ${item.size ? "• " + bytesToSize(item.size) : ""}</div>
        </div>
      </div>
      <div class="col-span-3 text-sm text-slate-600 dark:text-slate-300 self-center">${fmtDate(item.modified)}</div>
      <div class="col-span-2 self-center flex justify-end">
        <button class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-xs" data-more="${escapeHtml(item.id)}">Actions</button>
      </div>
    </div>
  `;
}
function renderList(list) {
  contentEl.innerHTML = `
    <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div class="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div class="col-span-7">Name</div>
        <div class="col-span-3">Modified</div>
        <div class="col-span-2 text-right">Actions</div>
      </div>
      <div>${list.map(rowList).join("")}</div>
    </div>
  `;
  bindItemEvents(list);
}

// -------- selection + AUTO PREVIEW --------
function bindItemEvents(currentList) {
  contentEl.querySelectorAll("[data-id]").forEach(el => {
    el.addEventListener("click", (e) => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      if (e.target?.hasAttribute("data-more")) return;

      const item = flatIndex.get(id);
      if (!item) return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const multiKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.shiftKey && lastClickedId) {
        const ids = currentList.map(x => x.id);
        const a = ids.indexOf(lastClickedId);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a];
          for (let i = start; i <= end; i++) selectedIds.add(ids[i]);
        }
      } else if (multiKey) {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        lastClickedId = id;
      } else {
        selectedIds.clear();
        selectedIds.add(id);
        lastClickedId = id;
      }

      // Folder: double click open, single click only select
      if (item.isDir) {
        if (e.detail === 2) {
          currentPath = item.relPath;
          selectedIds.clear();
          lastClickedId = null;
          render();
        } else {
          render();
        }
        return;
      }

      // ✅ AUTO PREVIEW: file single click opens preview
      render();
      setTimeout(() => openPreview(item), 80);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = el.getAttribute("data-id");
      if (!id) return;

      if (!selectedIds.has(id)) {
        selectedIds.clear();
        selectedIds.add(id);
        lastClickedId = id;
        render();
      }

      activeCtxItemId = id;
      showCtxMenu(e.clientX, e.clientY);
    });
  });

  contentEl.querySelectorAll("[data-more]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-more");
      activeCtxItemId = id;
      const r = btn.getBoundingClientRect();
      showCtxMenu(r.left, r.bottom + 6);
    });
  });
}

// -------- context menu --------
function showCtxMenu(x, y) {
  ctxMenu.classList.remove("hidden");
  const maxX = window.innerWidth - ctxMenu.offsetWidth - 8;
  const maxY = window.innerHeight - ctxMenu.offsetHeight - 8;
  ctxMenu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
}
function hideCtxMenu() {
  ctxMenu.classList.add("hidden");
  activeCtxItemId = null;
}
document.addEventListener("click", () => hideCtxMenu());
window.addEventListener("scroll", () => hideCtxMenu(), { passive: true });
window.addEventListener("resize", () => hideCtxMenu());

ctxMenu.querySelectorAll("[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.getAttribute("data-action");
    const id = activeCtxItemId || [...selectedIds][0];
    const item = flatIndex.get(id);
    hideCtxMenu();
    if (!item) return;

    if (action === "preview") openPreview(item);
    if (action === "newtab") openInNewTab(item);
    if (action === "download") downloadItem(item);
  });
});

// -------- actions --------
function openInNewTab(item) {
  if (!item.url) return;
  window.open(item.url, "_blank", "noopener,noreferrer");
}
function downloadItem(item) {
  if (!item.url) return;

  // ✅ .exe auto download OFF: confirm required
  if (item.kind === "app") {
    const ok = confirm("This is an installer/app file (.exe). Do you want to download it?");
    if (!ok) return;
  }

  const a = document.createElement("a");
  a.href = item.url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// -------- modal + PDF --------
closePreviewBtn.addEventListener("click", () => previewModal.close());

openNewTabBtn.addEventListener("click", () => {
  const id = previewModal.getAttribute("data-item-id");
  const item = flatIndex.get(id);
  if (item) openInNewTab(item);
});

downloadBtn.addEventListener("click", () => {
  const id = previewModal.getAttribute("data-item-id");
  const item = flatIndex.get(id);
  if (item) downloadItem(item);
});

let pdfDoc = null, pdfPageNum = 1, pdfScale = 1.2, pdfRendering = false;

async function renderPdf(url) {
  pdfDoc = await window["pdfjsLib"].getDocument(url).promise;
  document.getElementById("pdfPages").textContent = pdfDoc.numPages;
  pdfPageNum = 1;
  pdfScale = 1.2;

  document.getElementById("pdfPrev").onclick = () => { if (pdfPageNum > 1) { pdfPageNum--; queuePdfRender(); } };
  document.getElementById("pdfNext").onclick = () => { if (pdfPageNum < pdfDoc.numPages) { pdfPageNum++; queuePdfRender(); } };
  document.getElementById("pdfZoomIn").onclick  = () => { pdfScale = Math.min(3, pdfScale + 0.2); queuePdfRender(); };
  document.getElementById("pdfZoomOut").onclick = () => { pdfScale = Math.max(0.6, pdfScale - 0.2); queuePdfRender(); };

  await queuePdfRender(true);
}
async function queuePdfRender(immediate=false) {
  if (pdfRendering && !immediate) return;
  pdfRendering = true;

  document.getElementById("pdfPage").textContent = pdfPageNum;
  const page = await pdfDoc.getPage(pdfPageNum);
  const viewport = page.getViewport({ scale: pdfScale });
  const canvas = document.getElementById("pdfCanvas");
  const ctx = canvas.getContext("2d");
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: ctx, viewport }).promise;
  pdfRendering = false;
}

async function openPreview(item) {
  previewModal.setAttribute("data-item-id", item.id);
  previewTitle.textContent = item.name || "Preview";
  previewMeta.textContent = `${item.kind.toUpperCase()} • ${item.size ? bytesToSize(item.size) : "—"} • ${fmtDate(item.modified)}`;

  if (item.kind === "app") {
    previewBody.innerHTML = `
      <div class="h-[520px] grid place-items-center text-center p-8">
        <div class="text-5xl mb-3">🧩</div>
        <div class="font-semibold">App / Installer file</div>
        <div class="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Preview disabled for .exe. Download needs confirmation.
        </div>
      </div>
    `;
    previewModal.showModal();
    return;
  }

  if (item.isDir) {
    previewBody.innerHTML = `
      <div class="h-[520px] grid place-items-center text-center p-8">
        <div class="text-5xl mb-3">📁</div>
        <div class="font-semibold">Folder</div>
        <div class="text-sm text-slate-500 dark:text-slate-400 mt-2">Double click to open folder.</div>
      </div>
    `;
    previewModal.showModal();
    return;
  }

  if (item.kind === "image") {
    previewBody.innerHTML = `
      <div class="h-[520px] grid place-items-center">
        <img src="${item.url}" class="max-h-[520px] w-auto rounded-xl shadow-sm"
          onerror="this.outerHTML='<div class=\\'text-red-600 p-8\\'>❌ Image not found<br><div class=\\'text-xs text-slate-500\\'>${item.url}</div></div>'" />
      </div>
    `;
    previewModal.showModal();
    return;
  }

  if (item.kind === "video") {
    previewBody.innerHTML = `
      <video controls class="w-full h-[520px] rounded-xl bg-black">
        <source src="${item.url}">
      </video>
    `;
    previewModal.showModal();
    return;
  }

  if (item.kind === "pdf") {
    previewBody.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="text-sm text-slate-600 dark:text-slate-300">PDF Preview</div>
        <div class="flex items-center gap-2">
          <button id="pdfPrev" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-sm">Prev</button>
          <div class="text-sm"><span id="pdfPage">1</span> / <span id="pdfPages">?</span></div>
          <button id="pdfNext" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-sm">Next</button>
          <button id="pdfZoomIn" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-sm">+</button>
          <button id="pdfZoomOut" class="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-sm">-</button>
        </div>
      </div>
      <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-auto" style="height: 470px;">
        <canvas id="pdfCanvas" class="block mx-auto my-3"></canvas>
      </div>
    `;
    previewModal.showModal();
    await renderPdf(item.url);
    return;
  }

  previewBody.innerHTML = `
    <iframe src="${item.url}" class="w-full h-[520px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"></iframe>
  `;
  previewModal.showModal();
}

// -------- dark mode --------
function applyDarkMode(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("drive-ui-dark", isDark ? "1" : "0");
  darkToggle.textContent = isDark ? "Light" : "Dark";
}
darkToggle.addEventListener("click", () => {
  const now = document.documentElement.classList.contains("dark");
  applyDarkMode(!now);
});
applyDarkMode(localStorage.getItem("drive-ui-dark") === "1");

// -------- controls --------
viewGridBtn.addEventListener("click", () => { viewMode = "grid"; render(); });
viewListBtn.addEventListener("click", () => { viewMode = "list"; render(); });
searchInput.addEventListener("input", () => render());
typeFilter.addEventListener("change", () => render());
sortBy.addEventListener("change", () => render());

// -------- load tree.json --------
async function load() {
  setLoading(true);
  const res = await fetch(API_TREE, { cache: "no-store" });
  treeRoot = await res.json();

  flatIndex = new Map();
  buildIndex(treeRoot);

  currentPath = "";
  selectedIds.clear();
  lastClickedId = null;

  renderQuickFolders();
  setLoading(false);
  render();
}

load().catch(err => {
  console.error(err);
  setLoading(false);
  contentEl.classList.remove("hidden");
  contentEl.innerHTML = `<div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-red-600">Failed to load tree.json</div>`;
});