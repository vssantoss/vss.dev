/* vss.dev editor chrome: progressive enhancement over server-rendered pages.
   Every page is a real URL with inlined content; this layer adds tabs, a
   command palette, a source view, theme, and SPA navigation (open files
   without a full reload) with graceful fallback. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const FILES = window.FILES || [];
  const CURRENT = window.CURRENT || { name: "", crumb: "", url: location.href };
  const norm = (p) => { try { return new URL(p, location.href).pathname.replace(/\/$/, "") || "/"; } catch (e) { return p; } };
  const getCur = () => norm(CURRENT.url);

  const preview = $("#preview"), source = $("#source"), rawEl = $("#rawmd");
  let viewMode = "preview", sourceBuilt = false;
  let rawBody = rawEl ? stripFrontMatter(rawEl.textContent) : "";

  /* ---------- markdown source highlighter (Source tab only) ---------- */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function inlineHL(e) {
    e = e.replace(/`([^`]+)`/g, '<span class="t-codespan">`$1`</span>');
    e = e.replace(/(\[[^\]]+\])(\([^)]+\))/g, '<span class="t-link">$1</span><span class="t-url">$2</span>');
    e = e.replace(/(\*\*[^*]+\*\*)/g, '<span class="t-strong">$1</span>');
    return e;
  }
  function highlightMd(src) {
    let inFence = false;
    return src.replace(/\r\n/g, "\n").split("\n").map((line) => {
      let e = esc(line);
      if (/^```/.test(line)) { inFence = !inFence; return '<span class="t-fence">' + e + "</span>"; }
      if (inFence) return '<span class="t-code">' + e + "</span>";
      if (/^(#{1,6})\s/.test(line)) return '<span class="t-heading">' + e + "</span>";
      if (/^>\s?/.test(line)) return '<span class="t-quote">' + e + "</span>";
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return '<span class="t-hr">' + e + "</span>";
      e = e.replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="t-marker">$2</span>$3');
      return inlineHL(e);
    });
  }
  function stripFrontMatter(t) {
    t = t.replace(/^﻿/, "");
    const m = t.match(/^\s*\+\+\+\s*\n[\s\S]*?\n\+\+\+\s*\n?/);
    return (m ? t.slice(m[0].length) : t).replace(/^\n+/, "").replace(/\s+$/, "");
  }

  const icon = () => '<span class="fileicon">MD</span>';

  /* ---------- tree: active node + folder toggles ---------- */
  function markTree() {
    const cur = getCur();
    document.querySelectorAll(".tree .node.file").forEach((n) => {
      const active = norm(n.getAttribute("href")) === cur;
      n.classList.toggle("active", active);
      if (active) { const kids = n.closest(".children"); if (kids) kids.classList.remove("closed"); }
    });
  }
  function attachFolderToggles() {
    document.querySelectorAll(".tree .node.folder").forEach((f) => {
      f.addEventListener("click", () => {
        const kids = f.nextElementSibling;
        if (kids && kids.classList.contains("children")) kids.classList.toggle("closed");
      });
    });
  }

  /* ---------- tabs (persisted across navigations) ---------- */
  const TKEY = "vss-tabs";
  const readTabs = () => { try { return JSON.parse(localStorage.getItem(TKEY)) || []; } catch (e) { return []; } };
  const writeTabs = (t) => { try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch (e) {} };
  function renderTabs() {
    const cur = getCur();
    let tabs = readTabs().filter((t) => FILES.some((f) => norm(f.url) === norm(t.url)) || norm(t.url) === cur);
    if (!tabs.some((t) => norm(t.url) === cur)) tabs.push({ name: CURRENT.name, url: CURRENT.url });
    if (tabs.length > 12) tabs = tabs.slice(tabs.length - 12);
    writeTabs(tabs);
    const bar = $("#tabs"); if (!bar) return;
    bar.innerHTML = "";
    tabs.forEach((t) => {
      const active = norm(t.url) === cur;
      const a = document.createElement("a");
      a.className = "tab" + (active ? " active" : "");
      a.href = t.url; a.dataset.url = t.url;
      a.innerHTML = icon() + '<span class="nm">' + t.name + "</span>" +
        '<span class="x" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 5l14 14M19 5L5 19"/></svg></span>';
      bar.appendChild(a);
    });
  }
  let welcomeActive = false;
  function closeTab(url) {
    const left = readTabs().filter((x) => norm(x.url) !== norm(url));
    writeTabs(left);
    if (norm(url) === getCur()) {
      if (left.length) navigate(left[left.length - 1].url, true);
      else showWelcome();          // closed the last tab → empty state
    } else { renderTabs(); }
  }
  function showWelcome() {
    welcomeActive = true;
    if (preview) preview.hidden = true;
    if (source) source.hidden = true;
    const s = $("#seg"); if (s) s.hidden = true;
    const bar = $("#tabs"); if (bar) bar.innerHTML = "";
    const c = $("#crumb"); if (c) c.innerHTML = "";
    const tp = $("#title-path"); if (tp) tp.textContent = "";
    let w = $("#welcome");
    if (!w) { w = document.createElement("div"); w.id = "welcome"; w.className = "welcome"; const ed = $("#editor"); if (ed) ed.appendChild(w); }
    w.innerHTML = '<div class="logo">vss<b>.</b>dev</div><div class="hint">a workspace, in public<br><br>press <kbd>Ctrl</kbd> <kbd>K</kbd> to open a file<span class="cursor"></span></div>';
    w.hidden = false;
  }
  function hideWelcome() { welcomeActive = false; const w = $("#welcome"); if (w) w.hidden = true; }
  function reopenCurrent() { hideWelcome(); renderTabs(); renderCrumb(); updateSeg(); }

  /* ---------- breadcrumb ---------- */
  function renderCrumb() {
    const c = $("#crumb"); if (!c) return;
    const parts = ["vss.dev"].concat((CURRENT.crumb || CURRENT.name || "").split("/").filter(Boolean));
    c.innerHTML = parts.map((p, i) => {
      const last = i === parts.length - 1;
      return '<span class="c' + (last ? " last" : "") + '">' + p + "</span>" + (last ? "" : '<span class="car">›</span>');
    }).join("");
    const tp = $("#title-path"); if (tp) tp.textContent = CURRENT.crumb || CURRENT.name;
  }

  /* ---------- source / preview ---------- */
  function buildSource() {
    if (sourceBuilt || !source) return;
    source.innerHTML = highlightMd(rawBody).map((l, i) =>
      '<div class="row" style="animation-delay:' + Math.min(i * 0.012, 0.3) + 's"><span class="ln">' +
      (i + 1) + '</span><span class="lc">' + (l === "" ? "&nbsp;" : l) + "</span></div>"
    ).join("");
    sourceBuilt = true;
  }
  function setView(mode) {
    viewMode = mode;
    if (mode === "source") buildSource();
    if (preview) preview.hidden = mode !== "preview";
    if (source) source.hidden = mode !== "source";
    document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  }
  const seg = $("#seg");
  if (seg) seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.mode); });
  function updateSeg() {
    const s = $("#seg");
    if (!rawBody) { if (s) s.hidden = true; setView("preview"); }
    else { if (s) s.hidden = false; setView(viewMode); }
  }

  /* ---------- status bar ---------- */
  function setStatus() {
    const lines = rawBody ? rawBody.split("\n").length : 0;
    const words = (rawBody.match(/\S+/g) || []).length;
    if ($("#st-pos")) $("#st-pos").textContent = "Ln " + lines + ", Col 1";
    if ($("#st-words")) $("#st-words").textContent = words + " words";
  }
  function tick() {
    const d = new Date();
    if ($("#st-clock")) $("#st-clock").textContent =
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ---------- decorate external links in prose ---------- */
  function decorateLinks() {
    if (!preview) return;
    preview.querySelectorAll("a[href]").forEach((a) => {
      if (/^https?:/i.test(a.getAttribute("href")) && a.host !== location.host) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });
  }

  /* ---------- SPA navigation ---------- */
  let nav = 0; // guards against out-of-order fetches
  function applyDoc(doc, url) {
    hideWelcome();
    if (preview) preview.innerHTML = doc.querySelector("#preview").innerHTML;
    const newRaw = doc.querySelector("#rawmd");
    const rawText = newRaw ? newRaw.textContent : "";
    if (rawEl) rawEl.textContent = rawText;
    rawBody = stripFrontMatter(rawText);

    const crumb = (doc.querySelector("#title-path") || {}).textContent || "";
    CURRENT.url = url; CURRENT.crumb = crumb; CURRENT.name = crumb.split("/").pop() || crumb;

    // head / SEO for shareable history + correct tab title
    document.title = doc.title || document.title;
    const desc = (doc.querySelector('meta[name="description"]') || {}).content || "";
    setMeta('meta[name="description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:title"]', "content", document.title);
    setMeta('meta[property="og:description"]', "content", desc);

    sourceBuilt = false;
    markTree(); renderTabs(); renderCrumb(); setStatus(); decorateLinks(); updateSeg();
    const wrap = $("#editor"); if (wrap) wrap.scrollTop = 0;
  }
  function setMeta(sel, attr, val) { const el = $(sel); if (el) el.setAttribute(attr, val); }

  function navigate(url, push) {
    const abs = new URL(url, location.href).href;
    if (norm(abs) === getCur()) { if (welcomeActive) reopenCurrent(); closePalette(); return; }
    const id = ++nav;
    closePalette();
    fetch(abs, { headers: { "X-Requested-With": "fetch" } })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((html) => {
        if (id !== nav) return; // a newer navigation superseded this one
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (!doc.querySelector("#preview")) throw new Error("no preview");
        applyDoc(doc, abs);
        if (push) history.pushState({ url: abs }, "", abs);
      })
      .catch(() => { location.href = abs; }); // fallback: full navigation
  }
  window.addEventListener("popstate", () => navigate(location.href, false));

  /* ---------- global click delegation ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    // tab close button
    const x = e.target.closest(".tab .x");
    if (x) { e.preventDefault(); const tab = x.closest(".tab"); if (tab) closeTab(tab.dataset.url); return; }
    const href = a.getAttribute("href");
    if (!href || a.target === "_blank" || href.startsWith("mailto:") || href.startsWith("#")) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;                       // external
    if (/\.(xml|css|js|png|jpe?g|gif|svg|ico|txt|pdf)$/i.test(url.pathname)) return; // assets
    e.preventDefault();
    navigate(url.href, true);
  });

  /* ---------- theme ---------- */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("vss-theme", t); } catch (e) {}
    const moon = '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>';
    const sun = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>';
    if ($("#theme-icon")) $("#theme-icon").innerHTML = t === "ink" ? moon : sun;
  }
  if ($("#btn-theme")) $("#btn-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "ink" ? "paper" : "ink"));

  /* ---------- sidebar ---------- */
  const sidebarEl = $("#sidebar");
  // The sidebar floats over the content ("mobile"/overlay mode) only when the
  // window itself is narrow. CSS container queries decide that, so we read the
  // result back from layout instead of guessing from the viewport width.
  const isOverlay = () => !!sidebarEl && getComputedStyle(sidebarEl).position === "absolute";
  const toggleSidebar = () => { if (sidebarEl) sidebarEl.classList.toggle("collapsed"); };
  if ($("#act-files")) $("#act-files").addEventListener("click", toggleSidebar);
  // in overlay mode, a click outside the sidebar dismisses it
  document.addEventListener("click", (e) => {
    if (!sidebarEl || !isOverlay() || sidebarEl.classList.contains("collapsed")) return;
    if (e.target.closest("#sidebar") || e.target.closest("#act-files")) return;
    sidebarEl.classList.add("collapsed");
  });
  // As the window is resized across the overlay threshold, mirror mobile/desktop:
  // collapse when it becomes an overlay, reopen when it docks again.
  let wasOverlay = isOverlay();
  if (window.ResizeObserver) {
    const win = $(".window");
    if (win) new ResizeObserver(() => {
      const now = isOverlay();
      if (now === wasOverlay) return;
      wasOverlay = now;
      if (sidebarEl) sidebarEl.classList.toggle("collapsed", now);
    }).observe(win);
  }

  /* ---------- desktop windowing: drag / resize / min / max / close ---------- */
  const win = $(".window"), stage = $(".stage"), titlebar = $(".titlebar");
  const launcher = $("#icon-window");
  const btnClose = $("#win-close"), btnMin = $("#win-min"), btnMax = $("#win-max");
  const mqMobile = window.matchMedia("(max-width:840px)");
  const desktopMode = () => !mqMobile.matches;
  const px = (el, p) => parseFloat(el.style[p]) || 0;

  let isFree = false, savedGeom = null;
  function makeFree() {
    if (isFree || !win || !stage) return;
    const r = win.getBoundingClientRect(), s = stage.getBoundingClientRect();
    win.style.left = (r.left - s.left) + "px";
    win.style.top = (r.top - s.top) + "px";
    win.style.width = r.width + "px";
    win.style.height = r.height + "px";
    win.classList.add("free");
    isFree = true;
  }
  function clampGeom() {
    if (!win || !win.classList.contains("free")) return;
    const s = stage.getBoundingClientRect();
    const w = win.offsetWidth, h = win.offsetHeight;
    const minX = Math.min(0, s.width - w), maxX = Math.max(0, s.width - w);
    const minY = Math.min(0, s.height - h), maxY = Math.max(0, s.height - h);
    win.style.left = Math.min(Math.max(px(win, "left"), minX), maxX) + "px";
    win.style.top = Math.min(Math.max(px(win, "top"), minY), maxY) + "px";
  }

  // drag by the titlebar (but not its buttons)
  if (titlebar) titlebar.addEventListener("pointerdown", (e) => {
    if (!desktopMode() || e.button !== 0) return;
    if (e.target.closest(".dot, .iconbtn, .right, .win-handle")) return;
    if (win.classList.contains("maximized")) return;
    makeFree();
    const sx = e.clientX, sy = e.clientY, ox = px(win, "left"), oy = px(win, "top");
    win.classList.add("dragging");
    titlebar.setPointerCapture(e.pointerId);
    const move = (ev) => { win.style.left = (ox + ev.clientX - sx) + "px"; win.style.top = (oy + ev.clientY - sy) + "px"; clampGeom(); };
    const up = () => {
      titlebar.releasePointerCapture(e.pointerId);
      titlebar.removeEventListener("pointermove", move);
      titlebar.removeEventListener("pointerup", up);
      win.classList.remove("dragging");
    };
    titlebar.addEventListener("pointermove", move);
    titlebar.addEventListener("pointerup", up);
  });
  if (titlebar) titlebar.addEventListener("dblclick", (e) => {
    if (!desktopMode() || e.target.closest(".dot, .iconbtn, .right, .win-handle")) return;
    toggleMax();
  });

  // 8-direction resize grips
  function startResize(e, edge) {
    if (!desktopMode() || e.button !== 0 || win.classList.contains("maximized")) return;
    e.preventDefault();
    makeFree();
    const s = stage.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const x0 = px(win, "left"), y0 = px(win, "top"), w0 = win.offsetWidth, h0 = win.offsetHeight;
    const minW = 360, minH = 420;
    win.classList.add("dragging");
    e.target.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let left = x0, top = y0, w = w0, h = h0;
      if (edge.includes("e")) w = w0 + dx;
      if (edge.includes("s")) h = h0 + dy;
      if (edge.includes("w")) { w = w0 - dx; left = x0 + dx; }
      if (edge.includes("n")) { h = h0 - dy; top = y0 + dy; }
      if (w < minW) { if (edge.includes("w")) left -= minW - w; w = minW; }
      if (h < minH) { if (edge.includes("n")) top -= minH - h; h = minH; }
      if (left < 0) { if (edge.includes("w")) w += left; left = 0; }
      if (top < 0) { if (edge.includes("n")) h += top; top = 0; }
      if (left + w > s.width) w = s.width - left;
      if (top + h > s.height) h = s.height - top;
      win.style.left = left + "px"; win.style.top = top + "px";
      win.style.width = w + "px"; win.style.height = h + "px";
    };
    const up = () => {
      e.target.releasePointerCapture(e.pointerId);
      e.target.removeEventListener("pointermove", move);
      e.target.removeEventListener("pointerup", up);
      win.classList.remove("dragging");
    };
    e.target.addEventListener("pointermove", move);
    e.target.addEventListener("pointerup", up);
  }
  if (win) ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((edge) => {
    const h = document.createElement("div");
    h.className = "win-handle " + edge;
    h.addEventListener("pointerdown", (e) => startResize(e, edge));
    win.appendChild(h);
  });

  function toggleMax() {
    if (!desktopMode() || !win) return;
    if (win.classList.contains("maximized")) {
      win.classList.remove("maximized");
      if (savedGeom) { Object.assign(win.style, savedGeom); }
      savedGeom = null;
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
      clampGeom();
    } else {
      savedGeom = isFree ? { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height } : null;
      win.style.left = win.style.top = win.style.width = win.style.height = ""; // let fixed inset:0 take over
      win.classList.add("maximized");
      btnMax && btnMax.setAttribute("aria-label", "Restore");
    }
  }
  let closedReset = false;
  function hideWindow(reset) {
    if (!win) return;
    if (reset) {                       // close: also drop free/maximized geometry
      win.classList.remove("free", "maximized");
      isFree = false; savedGeom = null;
      win.style.left = win.style.top = win.style.width = win.style.height = "";
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
      closedReset = true;              // reopen should look like a first visit
    }
    win.classList.add("hidden");
    if (launcher) launcher.hidden = false;
  }
  function showWindow() {
    if (!win) return;
    win.classList.remove("hidden");
    if (launcher) launcher.hidden = true;
    if (closedReset) { closedReset = false; resetToFirstVisit(); replayRise(); }
  }
  // wipe session state so a reopened (closed) window starts fresh: no restored
  // tabs, back on the home page, Preview view, default sidebar. Theme and
  // desktop-icon positions are user/desktop preferences and intentionally kept.
  function resetToFirstVisit() {
    writeTabs([]);
    if (sidebarEl) sidebarEl.classList.toggle("collapsed", isOverlay());
    setView("preview");
    const home = (FILES[0] && FILES[0].url) || (location.origin + "/");
    if (norm(home) === getCur()) renderTabs();
    else navigate(home, true);
  }
  function replayRise() {               // re-trigger the open animation
    if (!win) return;
    win.style.animation = "none"; void win.offsetHeight; win.style.animation = "";
  }
  if (btnMax) btnMax.addEventListener("click", toggleMax);
  if (btnMin) btnMin.addEventListener("click", () => hideWindow(false));
  if (btnClose) btnClose.addEventListener("click", () => hideWindow(true));

  // crossing into mobile resets to the full-screen layout and never strands a hidden window
  mqMobile.addEventListener("change", (e) => {
    if (e.matches) {
      win && win.classList.remove("free", "maximized", "hidden");
      isFree = false; savedGeom = null;
      if (win) win.style.left = win.style.top = win.style.width = win.style.height = "";
      if (launcher) launcher.hidden = true;
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
    } else { clampGeom(); }
  });
  window.addEventListener("resize", () => { if (desktopMode()) clampGeom(); });

  /* ---------- desktop icons: snap-to-grid, draggable, persisted ---------- */
  const DESK = (function () {
    const layer = $("#desktop");
    if (!layer) return null;
    const CELL_W = 76, CELL_H = 92, MARGIN = 14, KEY = "vss-icons";
    const icons = [];                 // {id, el, col, row}
    const occ = new Map();            // "col,row" -> id
    const key = (c, r) => c + "," + r;
    const dims = () => {
      const r = layer.getBoundingClientRect();
      return { h: r.height, cols: Math.max(1, Math.floor((r.width - MARGIN * 2) / CELL_W)), rows: Math.max(1, Math.floor((r.height - MARGIN * 2) / CELL_H)) };
    };
    const cellToPx = (c, r) => ({ x: MARGIN + c * CELL_W, y: dims().h - MARGIN - (r + 1) * CELL_H });
    function pxToCell(x, y) {
      const d = dims();
      const c = Math.min(Math.max(Math.round((x - MARGIN) / CELL_W), 0), d.cols - 1);
      const r = Math.min(Math.max(Math.round((d.h - MARGIN - y) / CELL_H - 1), 0), d.rows - 1);
      return { c, r };
    }
    function nextFreeFrom(c, r) {           // walk up (rows) then right (cols)
      const d = dims();
      for (let cc = c; cc < d.cols; cc++)
        for (let rr = cc === c ? r : 0; rr < d.rows; rr++)
          if (!occ.has(key(cc, rr))) return { c: cc, r: rr };
      for (let cc = 0; cc < d.cols; cc++)
        for (let rr = 0; rr < d.rows; rr++)
          if (!occ.has(key(cc, rr))) return { c: cc, r: rr };
      return { c: 0, r: 0 };
    }
    const place = (i) => { const p = cellToPx(i.col, i.row); i.el.style.left = p.x + "px"; i.el.style.top = p.y + "px"; };
    function assign(i, c, r) {
      occ.delete(key(i.col, i.row));
      if (occ.has(key(c, r))) { const f = nextFreeFrom(c, r); c = f.c; r = f.r; }
      i.col = c; i.row = r; occ.set(key(c, r), i.id); place(i);
    }
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = () => { try { const o = {}; icons.forEach((i) => o[i.id] = { c: i.col, r: i.row }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    const stored = load();

    function register(el, opts) {
      opts = opts || {};
      const id = el.dataset.icon || el.id;
      if (opts.titleEl) {
        const name = Array.from(opts.titleEl.childNodes)
          .filter((n) => !(n.nodeType === 1 && n.classList.contains("path")))
          .map((n) => n.textContent).join("").trim();
        const lab = el.querySelector(".desk-label");
        if (lab) lab.textContent = name;
        if (name) el.setAttribute("aria-label", "Open " + name + " window");
      }
      const icon = { id, el, col: 0, row: 0 };
      const d = dims(), s = stored[id];
      let cell = (s && s.c < d.cols && s.r < d.rows && !occ.has(key(s.c, s.r))) ? { c: s.c, r: s.r } : nextFreeFrom(0, 0);
      icon.col = cell.c; icon.row = cell.r; occ.set(key(cell.c, cell.r), id);
      icons.push(icon); place(icon);

      let moved = false;
      el.addEventListener("pointerdown", (e) => {
        if (!desktopMode() || e.button !== 0) return;
        moved = false;
        const sx = e.clientX, sy = e.clientY, ox = parseFloat(el.style.left) || 0, oy = parseFloat(el.style.top) || 0;
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 4) return;
          moved = true; el.classList.add("dragging");
          el.style.left = (ox + dx) + "px"; el.style.top = (oy + dy) + "px";
        };
        const up = () => {
          el.releasePointerCapture(e.pointerId);
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          if (moved) {
            el.classList.remove("dragging");
            const cell = pxToCell(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
            assign(icon, cell.c, cell.r); save();
          }
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      });
      el.addEventListener("dblclick", () => { if (!moved && opts.onOpen) opts.onOpen(); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (opts.onOpen) opts.onOpen(); } });
      return icon;
    }

    function reflow() {
      const d = dims(); let changed = false;
      icons.forEach((i) => {
        if (i.col >= d.cols || i.row >= d.rows) { occ.delete(key(i.col, i.row)); const f = nextFreeFrom(0, 0); i.col = f.c; i.row = f.r; occ.set(key(f.c, f.r), i.id); changed = true; }
        place(i);
      });
      if (changed) save();
    }
    window.addEventListener("resize", reflow);
    return { register };
  })();

  if (DESK && launcher) DESK.register(launcher, { titleEl: $(".titlebar .who"), onOpen: showWindow });

  /* ---------- command palette ---------- */
  const pbg = $("#palette-bg"), pinput = $("#palette-input"), plist = $("#plist");
  let pSel = 0, pResults = [];
  function openPalette() { if (!pbg) return; pbg.classList.add("open"); pinput.value = ""; filterPalette(""); pinput.focus(); }
  function closePalette() { if (pbg) pbg.classList.remove("open"); }
  function filterPalette(q) { q = q.toLowerCase(); pResults = FILES.filter((f) => f.path.toLowerCase().includes(q)); pSel = 0; drawPalette(); }
  function drawPalette() {
    plist.innerHTML = pResults.map((f, i) =>
      '<a class="pitem' + (i === pSel ? " sel" : "") + '" href="' + f.url + '" data-i="' + i + '">' +
      icon() + "<span>" + f.name + '</span><span class="sub">' + (f.path.includes("/") ? f.path.split("/")[0] + "/" : "root") + "</span></a>"
    ).join("") || '<div class="pitem">no files match</div>';
    plist.querySelectorAll(".pitem[data-i]").forEach((el) =>
      el.addEventListener("mousemove", () => { pSel = +el.dataset.i; drawPalette(); }));
  }
  if (pinput) {
    pinput.addEventListener("input", (e) => filterPalette(e.target.value));
    pinput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); pSel = Math.min(pSel + 1, pResults.length - 1); drawPalette(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pSel = Math.max(pSel - 1, 0); drawPalette(); }
      else if (e.key === "Enter") { e.preventDefault(); if (pResults[pSel]) navigate(pResults[pSel].url, true); }
      else if (e.key === "Escape") closePalette();
    });
  }
  if (pbg) pbg.addEventListener("click", (e) => { if (e.target === pbg) closePalette(); });
  if ($("#btn-palette")) $("#btn-palette").addEventListener("click", openPalette);
  if ($("#act-search")) $("#act-search").addEventListener("click", openPalette);

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pbg && pbg.classList.contains("open") ? closePalette() : openPalette(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
    else if (e.key === "Escape") closePalette();
  });

  /* ---------- boot ---------- */
  setTheme(document.documentElement.dataset.theme || "ink");
  attachFolderToggles();
  markTree(); renderTabs(); renderCrumb(); setStatus(); decorateLinks(); updateSeg();
  history.replaceState({ url: CURRENT.url }, "", location.href);
  tick(); setInterval(tick, 1000);
  if (isOverlay() && sidebarEl) { sidebarEl.classList.add("collapsed"); wasOverlay = true; }
})();
