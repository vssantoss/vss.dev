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
  const isSmall = () => window.innerWidth <= 840;
  const toggleSidebar = () => { const s = $("#sidebar"); if (s) s.classList.toggle("collapsed"); };
  if ($("#act-files")) $("#act-files").addEventListener("click", toggleSidebar);
  // on small screens the sidebar is an overlay; a click outside it dismisses it
  document.addEventListener("click", (e) => {
    if (!isSmall()) return;
    const s = $("#sidebar");
    if (!s || s.classList.contains("collapsed")) return;
    if (e.target.closest("#sidebar") || e.target.closest("#act-files")) return;
    s.classList.add("collapsed");
  });

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
  if (window.innerWidth <= 840) { const s = $("#sidebar"); if (s) s.classList.add("collapsed"); }
})();
