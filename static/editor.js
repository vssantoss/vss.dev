/* vss.dev editor chrome: progressive enhancement over server-rendered pages.

   Every page is a real URL with inlined content; this layer adds tabs, a
   command palette, a source view, theme, and SPA navigation (open files
   without a full reload) with graceful fallback.
*/
(function () {
  "use strict";

  // Short query-selector helper: $(sel) on the document, or $(sel, root) scoped.
  const $ = (s, r) => (r || document).querySelector(s);

  // Page data injected by the server-rendered template.
  const FILES = window.FILES || [];
  const CURRENT = window.CURRENT || { name: "", crumb: "", url: location.href };

  // Normalise a URL to a comparable pathname (no trailing slash, "/" for root).
  const norm = (p) => { try { return new URL(p, location.href).pathname.replace(/\/$/, "") || "/"; } catch (e) { return p; } };

  // The normalised path of the page currently shown.
  const getCur = () => norm(CURRENT.url);

  // Core panes: rendered preview, raw source view, and the hidden raw markdown.
  const preview = $("#preview"), source = $("#source"), rawEl = $("#rawmd");
  let viewMode = "preview", sourceBuilt = false;

  // The page's markdown body, front matter stripped, kept current by applyDoc.
  let rawBody = rawEl ? stripFrontMatter(rawEl.textContent) : "";

  /* ---------- markdown source highlighter (Source tab only) ---------- */

  // Escape the three HTML-significant characters before injecting as innerHTML.
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Colour inline markdown spans: `code`, [links](url), and **strong**.
  function inlineHL(e) {
    e = e.replace(/`([^`]+)`/g, '<span class="t-codespan">`$1`</span>');
    e = e.replace(/(\[[^\]]+\])(\([^)]+\))/g, '<span class="t-link">$1</span><span class="t-url">$2</span>');
    e = e.replace(/(\*\*[^*]+\*\*)/g, '<span class="t-strong">$1</span>');
    return e;
  }

  // Colour a whole markdown document, line by line, returning an array of HTML
  // lines. Fenced code blocks are tracked so their contents aren't inline-parsed.
  function highlightMd(src) {
    let inFence = false;
    return src.replace(/\r\n/g, "\n").split("\n").map((line) => {
      let e = esc(line);

      // ``` opens or closes a fence; the fence line itself gets its own colour.
      if (/^```/.test(line)) { inFence = !inFence; return '<span class="t-fence">' + e + "</span>"; }

      // Inside a fence: everything is code, no further parsing.
      if (inFence) return '<span class="t-code">' + e + "</span>";

      // Block-level shapes: headings, quotes, horizontal rules.
      if (/^(#{1,6})\s/.test(line)) return '<span class="t-heading">' + e + "</span>";
      if (/^>\s?/.test(line)) return '<span class="t-quote">' + e + "</span>";
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return '<span class="t-hr">' + e + "</span>";

      // List markers, then any inline spans on the rest of the line.
      e = e.replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="t-marker">$2</span>$3');
      return inlineHL(e);
    });
  }

  // Drop a leading BOM and a +++ TOML front-matter block, then trim blank edges.
  function stripFrontMatter(t) {
    t = t.replace(/^﻿/, "");
    const m = t.match(/^\s*\+\+\+\s*\n[\s\S]*?\n\+\+\+\s*\n?/);
    return (m ? t.slice(m[0].length) : t).replace(/^\n+/, "").replace(/\s+$/, "");
  }

  // The little "MD" file-type badge reused in tabs, the tree and the palette.
  const icon = () => '<span class="fileicon">MD</span>';

  /* ---------- tree: active node + folder toggles ---------- */

  // Highlight the file matching the current URL.
  function markTree() {
    const cur = getCur();
    document.querySelectorAll(".tree .node.file").forEach((n) => {
      const active = norm(n.getAttribute("href")) === cur;
      n.classList.toggle("active", active);
    });
  }

  // Open or close a single folder node and its children list.
  function setFolderOpen(f, open) {
    const kids = f.nextElementSibling;
    f.classList.toggle("collapsed", !open);
    f.setAttribute("aria-expanded", open ? "true" : "false");
    if (kids && kids.classList.contains("children")) kids.classList.toggle("closed", !open);
  }

  // Wire click / keyboard toggles onto every folder, plus the project root.
  function attachFolderToggles() {
    document.querySelectorAll(".tree .node.folder").forEach((f) => {
      const toggle = () => {
        const kids = f.nextElementSibling;
        const open = !(kids && kids.classList.contains("closed"));
        setFolderOpen(f, !open);
      };
      f.addEventListener("click", toggle);
      f.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });

    // The project root collapses/expands the whole tree (like the editor's root node).
    const proj = $(".sb-proj"), tree = $("#tree");
    if (proj && tree) {
      const toggleProj = () => {
        const collapsed = proj.classList.toggle("collapsed");
        tree.classList.toggle("tree-collapsed", collapsed);
        proj.setAttribute("aria-expanded", collapsed ? "false" : "true");
      };
      proj.addEventListener("click", toggleProj);
      proj.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleProj(); } });
    }
  }

  /* ---------- tabs (persisted across navigations) ---------- */

  // Open tabs live in localStorage so they survive reloads and navigation.
  const TKEY = "vss-tabs";
  const readTabs = () => { try { return JSON.parse(localStorage.getItem(TKEY)) || []; } catch (e) { return []; } };
  const writeTabs = (t) => { try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch (e) {} };

  // Rebuild the tab strip from storage, ensuring the current page has a tab.
  function renderTabs() {
    const cur = getCur();

    // Keep only tabs that still point at a known file (or the current page).
    let tabs = readTabs().filter((t) => FILES.some((f) => norm(f.url) === norm(t.url)) || norm(t.url) === cur);

    // Make sure the page we're on always has a tab.
    if (!tabs.some((t) => norm(t.url) === cur)) tabs.push({ name: CURRENT.name, url: CURRENT.url });

    // Cap the number of remembered tabs, dropping the oldest.
    if (tabs.length > 12) tabs = tabs.slice(tabs.length - 12);
    writeTabs(tabs);

    const bar = $("#tabstrip"); if (!bar) return;
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
    layoutTabs();
  }

  /* ---------- tab overflow: collapse non-fitting tabs into a chevron menu ---------- */

  // The close (×) glyph reused inside the overflow dropdown items.
  const xIcon = '<span class="x" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 5l14 14M19 5L5 19"/></svg></span>';

  // Measure the strip; if the tabs overflow, hide the ones that don't fit and
  // list them in a chevron dropdown, always keeping the active tab visible.
  function layoutTabs() {
    const strip = $("#tabstrip"), btn = $("#tabovf"), menu = $("#tabmenu");
    if (!strip || !btn) return;

    // Start from a clean slate: show every tab, then decide what to hide.
    const tabs = Array.from(strip.children);
    tabs.forEach((t) => t.classList.remove("ovf-hidden"));

    // No tabs at all: hide the chevron and empty the menu.
    if (!tabs.length) { btn.hidden = true; if (menu) { menu.hidden = true; menu.innerHTML = ""; } closeTabMenu(); return; }

    const avail = strip.clientWidth;
    const widths = tabs.map((t) => t.offsetWidth);
    const total = widths.reduce((a, b) => a + b, 0);

    // Everything fits: no overflow control needed.
    if (total <= avail) { btn.hidden = true; if (menu) menu.innerHTML = ""; closeTabMenu(); return; }

    // Reserve room for the chevron control, then grow a window that always
    // includes the active tab, expanding right first and then left.
    const usable = avail - 52;
    let act = tabs.findIndex((t) => t.classList.contains("active"));
    if (act < 0) act = 0;
    let lo = act, hi = act, used = widths[act];
    while (true) {
      const canR = hi + 1 < tabs.length, canL = lo - 1 >= 0;
      if (canR && used + widths[hi + 1] <= usable) { hi++; used += widths[hi]; continue; }
      if (canL && used + widths[lo - 1] <= usable) { lo--; used += widths[lo]; continue; }
      break;
    }

    // Anything outside the [lo, hi] window is hidden and goes into the menu.
    const hidden = [];
    tabs.forEach((t, i) => {
      if (i < lo || i > hi) { t.classList.add("ovf-hidden"); hidden.push(t); }
    });

    // Reveal the chevron and badge it with the hidden-tab count.
    btn.hidden = false;
    const n = btn.querySelector(".tabovf-n"); if (n) n.textContent = hidden.length;

    // Mirror the hidden tabs into the dropdown menu.
    if (menu) {
      const cur = getCur();
      menu.innerHTML = hidden.map((t) => {
        const active = norm(t.dataset.url) === cur;
        const name = (t.querySelector(".nm") || {}).textContent || "";
        return '<a class="item' + (active ? " active" : "") + '" role="menuitem" tabindex="0" href="' +
          t.dataset.url + '" data-url="' + t.dataset.url + '"><span class="nm">' + name + "</span>" + xIcon + "</a>";
      }).join("");
    }
  }

  // Show the overflow dropdown (no-op when there's nothing to overflow).
  function openTabMenu() {
    const btn = $("#tabovf"), menu = $("#tabmenu");
    if (!btn || !menu || btn.hidden) return;
    menu.hidden = false; btn.classList.add("open"); btn.setAttribute("aria-expanded", "true");
  }

  // Hide the overflow dropdown and reset the chevron's state.
  function closeTabMenu() {
    const btn = $("#tabovf"), menu = $("#tabmenu");
    if (menu) menu.hidden = true;
    if (btn) { btn.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
  }

  // Flip the overflow dropdown open/closed.
  function toggleTabMenu() {
    const menu = $("#tabmenu");
    if (menu && menu.hidden) openTabMenu(); else closeTabMenu();
  }

  // True while the empty "welcome" state (all tabs closed) is showing.
  let welcomeActive = false;

  // Close one tab; navigate to a neighbour, or show the welcome state if it was
  // the last one and the current page.
  function closeTab(url) {
    const left = readTabs().filter((x) => norm(x.url) !== norm(url));
    writeTabs(left);
    if (norm(url) === getCur()) {
      if (left.length) navigate(left[left.length - 1].url, true);

      // Closed the last tab: drop into the empty state.
      else showWelcome();
    } else { renderTabs(); }
  }

  // Empty state shown when every tab is closed: clears the chrome and prints a
  // centered logo + hint inside the editor pane.
  function showWelcome() {
    welcomeActive = true;
    if (preview) preview.hidden = true;
    if (source) source.hidden = true;
    showSrcCopy(false);
    const s = $("#seg"); if (s) s.hidden = true;
    const bar = $("#tabstrip"); if (bar) bar.innerHTML = "";
    const ovf = $("#tabovf"); if (ovf) ovf.hidden = true;
    closeTabMenu();
    const c = $("#crumb"); if (c) c.innerHTML = "";
    const tp = $("#title-path"); if (tp) tp.textContent = "";

    // Create the welcome element once, then reuse it.
    let w = $("#welcome");
    if (!w) { w = document.createElement("div"); w.id = "welcome"; w.className = "welcome"; const ed = $("#editor"); if (ed) ed.appendChild(w); }
    w.innerHTML = '<div class="logo">vss<b>.</b>dev</div><div class="hint">a workspace, in public<br><br>press <kbd>Ctrl</kbd> <kbd>K</kbd> to open a file<span class="cursor"></span></div>';
    w.hidden = false;
  }

  // Hide the welcome state.
  function hideWelcome() { welcomeActive = false; const w = $("#welcome"); if (w) w.hidden = true; }

  // Leave the welcome state and re-show the current page's chrome.
  function reopenCurrent() { hideWelcome(); renderTabs(); renderCrumb(); updateSeg(); }

  /* ---------- breadcrumb ---------- */

  // Render the "vss.dev › folder › file" trail and sync the title-path element.
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

  // Build the highlighted, line-numbered source view once (lazily, on first
  // switch to the Source tab) and cache it.
  function buildSource() {
    if (sourceBuilt || !source) return;
    source.innerHTML = highlightMd(rawBody).map((l, i) =>
      '<div class="row" style="animation-delay:' + Math.min(i * 0.012, 0.3) + 's"><span class="ln">' +
      (i + 1) + '</span><span class="lc">' + (l === "" ? "&nbsp;" : l) + "</span></div>"
    ).join("");
    sourceBuilt = true;
  }

  // Switch between "preview" and "source", toggling panes, the copy button, the
  // status-bar language label, and the active segmented-control button.
  function setView(mode) {
    viewMode = mode;
    if (mode === "source") buildSource();
    if (preview) preview.hidden = mode !== "preview";
    if (source) source.hidden = mode !== "source";
    showSrcCopy(mode === "source" && !!rawBody);
    if ($("#st-lang")) $("#st-lang").textContent = mode === "source" ? "Markdown" : "Markdown Preview";
    document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  }

  // The preview/source segmented control.
  const seg = $("#seg");
  if (seg) seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.mode); });

  // Show or hide the segmented control depending on whether the page has a body
  // to toggle, and reassert the current view.
  function updateSeg() {
    const s = $("#seg");
    if (!rawBody) { if (s) s.hidden = true; setView("preview"); }
    else { if (s) s.hidden = false; setView(viewMode); }
  }

  /* ---------- status bar ---------- */

  // Update the line and word counts from the current body.
  function setStatus() {
    const lines = rawBody ? rawBody.split("\n").length : 0;
    const words = (rawBody.match(/\S+/g) || []).length;
    if ($("#st-pos")) $("#st-pos").textContent = "Ln " + lines + ", Col 1";
    if ($("#st-words")) $("#st-words").textContent = words + " words";
  }

  // Update the HH:MM clock in the kernel status bar and every open app window.
  function tick() {
    const d = new Date();
    const t = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    document.querySelectorAll("#st-clock, .app-clock").forEach((el) => { el.textContent = t; });
  }

  /* ---------- decorate external links in prose ---------- */

  // Open off-site links in a new tab, with safe rel attributes.
  function decorateLinks() {
    if (!preview) return;
    preview.querySelectorAll("a[href]").forEach((a) => {
      if (/^https?:/i.test(a.getAttribute("href")) && a.host !== location.host) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });
  }

  /* ---------- code blocks: client-side highlight + copy (theme-aware) ----------

     Generic, language-agnostic tokeniser. Not a full parser: it colours the
     shapes GitHub does (comments, strings, numbers, keywords, calls, types)
     using the same --t-* theme variables as the Source view, so ink/paper
     both work and no fixed colours are baked into the HTML.
  */

  // Keywords coloured across the languages we care about (a broad union set).
  const HL_KW = new Set("abstract as async await begin break case catch chan class const continue declare def defer delete do done elif else end enum export extends fi final finally fn for from fun func function go goto if impl implements import in instanceof interface lambda let local loop match mod module move mut namespace new of override package pass private protected pub public raise readonly ref require return select self static struct super switch then this throw trait type typeof unless until use val var virtual void where while with yield".split(" "));

  // Literals coloured as constants rather than identifiers.
  const HL_CONST = new Set("true false null undefined nil None True False NaN Infinity".split(" "));

  // Escape, then wrap, helpers for emitting highlighted spans.
  function hlEsc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function hlSpan(c, t) { return '<span class="' + c + '">' + hlEsc(t) + "</span>"; }

  // Tokenise one code string and return highlighted HTML.
  function highlightCodeStr(src, lang) {
    lang = (lang || "").toLowerCase();

    // Languages where a leading # is a comment (shells, configs) rather than code.
    const hash = /^(sh|bash|shell|zsh|console|fish|toml|ini|cfg|conf|yaml|yml|py|python|rb|ruby|pl|perl|r|make|makefile|dockerfile|nginx|properties|env|gitignore|text)$/.test(lang);

    // One regex with alternatives, in priority order: block comment, // comment,
    // # comment, string, number, identifier.
    const re = /(\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|(\/\/[^\n]*)|(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b0[xX][0-9a-fA-F]+\b|\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {

      // Emit the untokenised gap before this match verbatim (escaped).
      out += hlEsc(src.slice(last, m.index));
      last = re.lastIndex;

      // Comments.
      if (m[1] || m[2]) out += hlSpan("hl-c", m[1] || m[2]);

      // A # line: a comment only in hash-comment languages; otherwise rewind so
      // the rest of the "word" is re-tokenised normally.
      else if (m[3]) { if (hash) out += hlSpan("hl-c", m[3]); else { out += "#"; last = m.index + 1; re.lastIndex = last; } }

      // Strings.
      else if (m[4]) out += hlSpan("hl-s", m[4]);

      // Numbers.
      else if (m[5]) out += hlSpan("hl-n", m[5]);

      // Identifiers: classify as constant, keyword, call, type, or plain word.
      else if (m[6]) {
        const w = m[6];
        if (HL_CONST.has(w)) out += hlSpan("hl-cn", w);
        else if (HL_KW.has(w)) out += hlSpan("hl-k", w);

        // Followed by "(": treat as a function call.
        else if (/^\s*\(/.test(src.slice(last))) out += hlSpan("hl-f", w);

        // CamelCase / Capitalised: treat as a type name.
        else if (/^[A-Z]/.test(w) && w.length > 1) out += hlSpan("hl-t", w);
        else out += hlEsc(w);
      }
    }

    // Emit the trailing remainder after the last match.
    out += hlEsc(src.slice(last));
    return out;
  }

  // Copy / confirm icons reused by the code-block and source copy buttons.
  const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 13l4 4L19 7"/></svg>';

  // Highlight every code block in the preview and add a hover "copy" button.
  function enhanceCode() {
    if (!preview) return;

    // Highlight each block once (guarded by a data flag).
    preview.querySelectorAll("pre > code").forEach((code) => {
      if (code.dataset.hl) return;
      code.dataset.hl = "1";
      code.innerHTML = highlightCodeStr(code.textContent, code.dataset.lang || "");
    });

    // Attach a copy button to each <pre> (once).
    preview.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copybtn")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "copybtn"; btn.setAttribute("aria-label", "Copy code"); btn.title = "Copy";
      btn.innerHTML = COPY_ICON;
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        const text = (code || pre).textContent;

        // Briefly swap to a checkmark on success, then revert.
        const done = () => { btn.classList.add("ok"); btn.innerHTML = CHECK_ICON; setTimeout(() => { btn.classList.remove("ok"); btn.innerHTML = COPY_ICON; }, 1400); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => {});
      });
      pre.appendChild(btn);
    });
  }

  /* ---------- Source view: copy the raw markdown ----------

     Floats over the pane and copies the live rawBody, which applyDoc keeps
     current across navigation.
  */

  const srcCopyBtn = $("#srccopy-float");

  // Copy the raw markdown body, flashing a checkmark on success.
  function copySource() {
    if (!rawBody || !navigator.clipboard) return;
    navigator.clipboard.writeText(rawBody).then(() => {
      srcCopyBtn.classList.add("ok"); srcCopyBtn.innerHTML = CHECK_ICON;
      setTimeout(() => { srcCopyBtn.classList.remove("ok"); srcCopyBtn.innerHTML = COPY_ICON; }, 1400);
    }).catch(() => {});
  }

  // Show/hide the floating source-copy button.
  function showSrcCopy(show) { if (srcCopyBtn) srcCopyBtn.hidden = !show; }
  if (srcCopyBtn) { srcCopyBtn.innerHTML = COPY_ICON; srcCopyBtn.addEventListener("click", copySource); }

  /* ---------- SPA navigation ---------- */

  // Monotonic id that guards against out-of-order fetches.
  let nav = 0;

  // Swap the page contents in place from a fetched document: preview, raw body,
  // breadcrumb, head/SEO tags, then re-run all the per-page decorators.
  function applyDoc(doc, url) {
    hideWelcome();
    if (preview) preview.innerHTML = doc.querySelector("#preview").innerHTML;
    const newRaw = doc.querySelector("#rawmd");
    const rawText = newRaw ? newRaw.textContent : "";
    if (rawEl) rawEl.textContent = rawText;
    rawBody = stripFrontMatter(rawText);

    // Update the "current page" identity from the new document.
    const crumb = (doc.querySelector("#title-path") || {}).textContent || "";
    CURRENT.url = url; CURRENT.crumb = crumb; CURRENT.name = crumb.split("/").pop() || crumb;

    // Head / SEO for shareable history + correct tab title.
    document.title = doc.title || document.title;
    const desc = (doc.querySelector('meta[name="description"]') || {}).content || "";
    setMeta('meta[name="description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:title"]', "content", document.title);
    setMeta('meta[property="og:description"]', "content", desc);

    // Source view must be rebuilt for the new body; refresh all chrome.
    sourceBuilt = false;
    markTree(); renderTabs(); renderCrumb(); setStatus(); decorateLinks(); enhanceCode(); updateSeg();
    const wrap = $("#editor"); if (wrap) wrap.scrollTop = 0;
  }

  // Set an attribute on a head element if it exists.
  function setMeta(sel, attr, val) { const el = $(sel); if (el) el.setAttribute(attr, val); }

  // Fetch a page and swap it in without a full reload; fall back to a real
  // navigation on any error. `push` controls whether history gets a new entry.
  function navigate(url, push) {
    const abs = new URL(url, location.href).href;

    // Already here: just clean up overlays.
    if (norm(abs) === getCur()) { if (welcomeActive) reopenCurrent(); closePalette(); return; }

    const id = ++nav;
    closePalette();
    fetch(abs, { headers: { "X-Requested-With": "fetch" } })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((html) => {

        // A newer navigation superseded this one: discard the stale response.
        if (id !== nav) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (!doc.querySelector("#preview")) throw new Error("no preview");
        applyDoc(doc, abs);
        if (push) history.pushState({ url: abs }, "", abs);
      })

      // Fallback: hand off to a full browser navigation.
      .catch(() => { location.href = abs; });
  }

  // Back/forward buttons: re-render the target page (no new history entry).
  window.addEventListener("popstate", () => navigate(location.href, false));

  /* ---------- global click delegation ----------

     One document-level click handler routes tab-menu, tab-close, and link
     clicks. Each branch returns early once it has handled the event.
  */

  document.addEventListener("click", (e) => {

    // Overflow chevron toggles its dropdown.
    if (e.target.closest("#tabovf")) { e.preventDefault(); toggleTabMenu(); return; }

    // Close from inside the overflow menu.
    const mx = e.target.closest(".tabmenu .item .x");
    if (mx) { e.preventDefault(); const it = mx.closest(".item"); if (it) closeTab(it.dataset.url); return; }

    // Open from inside the overflow menu.
    const mi = e.target.closest(".tabmenu .item");
    if (mi) { e.preventDefault(); closeTabMenu(); navigate(mi.dataset.url, true); return; }

    // Clicking elsewhere dismisses an open menu.
    if (!e.target.closest("#tabmenu")) closeTabMenu();

    const a = e.target.closest("a");
    if (!a) return;

    // Tab close button.
    const x = e.target.closest(".tab .x");
    if (x) { e.preventDefault(); const tab = x.closest(".tab"); if (tab) closeTab(tab.dataset.url); return; }

    // Plain links: skip new-tab / mailto / in-page anchors.
    const href = a.getAttribute("href");
    if (!href || a.target === "_blank" || href.startsWith("mailto:") || href.startsWith("#")) return;
    const url = new URL(href, location.href);

    // Leave external links and static assets to the browser.
    if (url.origin !== location.origin) return;
    if (/\.(xml|css|js|png|jpe?g|gif|svg|ico|txt|pdf)$/i.test(url.pathname)) return;

    // A /app/<name>/ link launches the mini-app over the website instead of
    // swapping page content.
    const appMatch = url.pathname.match(/^\/app\/([^\/]+)\/?$/);
    if (appMatch) { e.preventDefault(); WM.launch(appMatch[1], url.href); return; }

    // Same-origin page: intercept and navigate via SPA.
    e.preventDefault();
    navigate(url.href, true);
  });

  /* ---------- theme ---------- */

  // Open mini-apps that asked to be told when the theme flips (api.onThemeChange).
  const appThemeCbs = new Set();

  // Apply a theme ("ink" / "paper"), persist it, and swap the toggle's icon.
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("vss-theme", t); } catch (e) {}
    const moon = '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>';
    const sun = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>';
    if ($("#theme-icon")) $("#theme-icon").innerHTML = t === "ink" ? moon : sun;
    appThemeCbs.forEach((cb) => { try { cb(t); } catch (e) {} });
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

  // In overlay mode, a click outside the sidebar dismisses it.
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
      layoutTabs();
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

  // Window management is desktop-only; below this width the window is full-screen.
  const mqMobile = window.matchMedia("(max-width:840px)");
  const desktopMode = () => !mqMobile.matches;

  // Read a pixel style value as a number.
  const px = (el, p) => parseFloat(el.style[p]) || 0;

  // `isFree` = the window has been dragged/resized off its default centered slot.
  let isFree = false, savedGeom = null;

  // Promote a window to free-floating by freezing its current geometry inline.
  // Defaults to the kernel window; app windows are born free, so this is a no-op
  // for them. Only the kernel tracks the `isFree` flag.
  function makeFree(w) {
    w = w || win;
    if (!w || !stage || w.classList.contains("free")) return;
    const r = w.getBoundingClientRect(), s = stage.getBoundingClientRect();
    w.style.left = (r.left - s.left) + "px";
    w.style.top = (r.top - s.top) + "px";
    w.style.width = r.width + "px";
    w.style.height = r.height + "px";
    w.classList.add("free");
    if (w === win) isFree = true;
  }

  // Keep a free window's top-left within the stage bounds (any window).
  function clampGeom(w) {
    w = w || win;
    if (!w || !w.classList.contains("free")) return;
    const s = stage.getBoundingClientRect();
    const ww = w.offsetWidth, hh = w.offsetHeight;
    const minX = Math.min(0, s.width - ww), maxX = Math.max(0, s.width - ww);
    const minY = Math.min(0, s.height - hh), maxY = Math.max(0, s.height - hh);
    w.style.left = Math.min(Math.max(px(w, "left"), minX), maxX) + "px";
    w.style.top = Math.min(Math.max(px(w, "top"), minY), maxY) + "px";
  }

  // Drag by the titlebar (but not its buttons).
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

  // Double-clicking the titlebar maximizes / restores.
  if (titlebar) titlebar.addEventListener("dblclick", (e) => {
    if (!desktopMode() || e.target.closest(".dot, .iconbtn, .right, .win-handle")) return;
    toggleMax();
  });

  // 8-direction resize from a grip; `edge` is some combination of n/s/e/w.
  // Operates on the given window (defaults to the kernel window).
  function startResize(e, edge, w) {
    w = w || win;
    if (!desktopMode() || e.button !== 0 || w.classList.contains("maximized")) return;
    e.preventDefault();
    makeFree(w);
    const s = stage.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const x0 = px(w, "left"), y0 = px(w, "top"), w0 = w.offsetWidth, h0 = w.offsetHeight;
    const cs = getComputedStyle(w);
    const minW = parseFloat(cs.minWidth) || 320, minH = parseFloat(cs.minHeight) || 220;
    w.classList.add("dragging");
    e.target.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let left = x0, top = y0, ww = w0, hh = h0;

      // Each edge in `edge` moves the matching side; west/north also shift the origin.
      if (edge.includes("e")) ww = w0 + dx;
      if (edge.includes("s")) hh = h0 + dy;
      if (edge.includes("w")) { ww = w0 - dx; left = x0 + dx; }
      if (edge.includes("n")) { hh = h0 - dy; top = y0 + dy; }

      // Enforce the minimum size without letting a west/north drag overshoot.
      if (ww < minW) { if (edge.includes("w")) left -= minW - ww; ww = minW; }
      if (hh < minH) { if (edge.includes("n")) top -= minH - hh; hh = minH; }

      // Clamp to the stage edges.
      if (left < 0) { if (edge.includes("w")) ww += left; left = 0; }
      if (top < 0) { if (edge.includes("n")) hh += top; top = 0; }
      if (left + ww > s.width) ww = s.width - left;
      if (top + hh > s.height) hh = s.height - top;
      w.style.left = left + "px"; w.style.top = top + "px";
      w.style.width = ww + "px"; w.style.height = hh + "px";
    };
    const up = () => {
      e.target.releasePointerCapture(e.pointerId);
      e.target.removeEventListener("pointermove", move);
      e.target.removeEventListener("pointerup", up);
      w.classList.remove("dragging");
    };
    e.target.addEventListener("pointermove", move);
    e.target.addEventListener("pointerup", up);
  }

  // Create the eight resize grips on a window and wire each to startResize.
  function addResizeGrips(w) {
    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((edge) => {
      const h = document.createElement("div");
      h.className = "win-handle " + edge;
      h.addEventListener("pointerdown", (e) => startResize(e, edge, w));
      w.appendChild(h);
    });
  }
  if (win) addResizeGrips(win);

  // Maximize the window, or restore it to its saved free geometry.
  function toggleMax() {
    if (!desktopMode() || !win) return;
    if (win.classList.contains("maximized")) {
      win.classList.remove("maximized");
      if (savedGeom) { Object.assign(win.style, savedGeom); }
      savedGeom = null;
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
      clampGeom();
    } else {

      // Remember a free window's geometry so restore can return to it, then let
      // the fixed inset:0 maximized rule take over.
      savedGeom = isFree ? { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height } : null;
      win.style.left = win.style.top = win.style.width = win.style.height = "";
      win.classList.add("maximized");
      btnMax && btnMax.setAttribute("aria-label", "Restore");
    }
  }

  // True once the window was closed (vs minimized), so reopening starts fresh.
  let closedReset = false;

  // Hide the window. Its desktop launcher is always visible (like the app
  // icons), so this just minimizes. `reset` (close) also drops any free/maximized
  // geometry so a reopen looks like a first visit.
  function hideWindow(reset) {
    if (!win) return;
    if (reset) {
      win.classList.remove("free", "maximized");
      isFree = false; savedGeom = null;
      win.style.left = win.style.top = win.style.width = win.style.height = "";
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
      closedReset = true;
    }
    win.classList.add("hidden");
  }

  // Re-show the window; if it had been closed, reset state and replay the rise.
  function showWindow() {
    if (!win) return;
    win.classList.remove("hidden");
    if (closedReset) { closedReset = false; resetToFirstVisit(); replayRise(); }
  }

  // Wipe session state so a reopened (closed) window starts fresh: no restored
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

  // Re-trigger the window open animation.
  function replayRise() {
    if (!win) return;
    win.style.animation = "none"; void win.offsetHeight; win.style.animation = "";
  }
  if (btnMax) btnMax.addEventListener("click", toggleMax);
  if (btnMin) btnMin.addEventListener("click", () => hideWindow(false));
  if (btnClose) btnClose.addEventListener("click", () => hideWindow(true));

  // Crossing into mobile drops desktop-only floating/maximized geometry and
  // restores the full-screen layout. A minimized/closed window stays that way.
  mqMobile.addEventListener("change", (e) => {
    if (e.matches) {
      win && win.classList.remove("free", "maximized");
      isFree = false; savedGeom = null;
      if (win) win.style.left = win.style.top = win.style.width = win.style.height = "";
      btnMax && btnMax.setAttribute("aria-label", "Maximize");
    } else { clampGeom(); }
  });
  window.addEventListener("resize", () => { if (desktopMode()) clampGeom(); });

  /* ---------- desktop icons: snap-to-grid, draggable, persisted ---------- */

  const DESK = (function () {
    const layer = $("#desktop");
    if (!layer) return null;

    // Grid cell geometry and the storage key for icon positions.
    const CELL_W = 76, CELL_H = 92, MARGIN = 14, KEY = "vss-icons";

    // Registered icons and an occupancy map keyed by "col,row".
    const icons = [];                 // {id, el, col, row}
    const occ = new Map();            // "col,row" -> id
    const key = (c, r) => c + "," + r;

    // Current layer size in pixels and the column/row counts that fit.
    const dims = () => {
      const r = layer.getBoundingClientRect();
      return { h: r.height, cols: Math.max(1, Math.floor((r.width - MARGIN * 2) / CELL_W)), rows: Math.max(1, Math.floor((r.height - MARGIN * 2) / CELL_H)) };
    };

    // Convert a grid cell to a pixel position (rows count up from the bottom).
    const cellToPx = (c, r) => ({ x: MARGIN + c * CELL_W, y: dims().h - MARGIN - (r + 1) * CELL_H });

    // Convert a pixel position back to the nearest grid cell, clamped in range.
    function pxToCell(x, y) {
      const d = dims();
      const c = Math.min(Math.max(Math.round((x - MARGIN) / CELL_W), 0), d.cols - 1);
      const r = Math.min(Math.max(Math.round((d.h - MARGIN - y) / CELL_H - 1), 0), d.rows - 1);
      return { c, r };
    }

    // Find the first free cell, walking up (rows) then right (cols), wrapping
    // from the origin if the tail is full.
    function nextFreeFrom(c, r) {
      const d = dims();
      for (let cc = c; cc < d.cols; cc++)
        for (let rr = cc === c ? r : 0; rr < d.rows; rr++)
          if (!occ.has(key(cc, rr))) return { c: cc, r: rr };
      for (let cc = 0; cc < d.cols; cc++)
        for (let rr = 0; rr < d.rows; rr++)
          if (!occ.has(key(cc, rr))) return { c: cc, r: rr };
      return { c: 0, r: 0 };
    }

    // Position an icon's element from its grid cell.
    const place = (i) => { const p = cellToPx(i.col, i.row); i.el.style.left = p.x + "px"; i.el.style.top = p.y + "px"; };

    // Move an icon to a cell, bouncing to the next free one if it's occupied.
    function assign(i, c, r) {
      occ.delete(key(i.col, i.row));
      if (occ.has(key(c, r))) { const f = nextFreeFrom(c, r); c = f.c; r = f.r; }
      i.col = c; i.row = r; occ.set(key(c, r), i.id); place(i);
    }

    // Load / save icon positions from localStorage.
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = () => { try { const o = {}; icons.forEach((i) => o[i.id] = { c: i.col, r: i.row }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    const stored = load();

    // Register one icon element: label it, place it (restoring a saved cell when
    // valid), and wire dragging + open (double-click / Enter / Space).
    function register(el, opts) {
      opts = opts || {};
      const id = el.dataset.icon || el.id;

      // Derive the icon label from the window's titlebar, ignoring the path span.
      if (opts.titleEl) {
        const name = Array.from(opts.titleEl.childNodes)
          .filter((n) => !(n.nodeType === 1 && n.classList.contains("path")))
          .map((n) => n.textContent).join("").trim();
        const lab = el.querySelector(".desk-label");
        if (lab) lab.textContent = name;
        if (name) el.setAttribute("aria-label", "Open " + name + " window");
      }

      // Restore the saved cell if it still fits and is free, else find one.
      const icon = { id, el, col: 0, row: 0 };
      const d = dims(), s = stored[id];
      let cell = (s && s.c < d.cols && s.r < d.rows && !occ.has(key(s.c, s.r))) ? { c: s.c, r: s.r } : nextFreeFrom(0, 0);
      icon.col = cell.c; icon.row = cell.r; occ.set(key(cell.c, cell.r), id);
      icons.push(icon); place(icon);

      // `moved` distinguishes a drag from a tap so open doesn't fire on drop.
      // The icon behaves the same at every screen size: always draggable, one
      // tap to open (so it is NOT gated on desktopMode).
      let moved = false;
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        moved = false;
        const sx = e.clientX, sy = e.clientY, ox = parseFloat(el.style.left) || 0, oy = parseFloat(el.style.top) || 0;
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;

          // Ignore sub-4px jitter so a plain click isn't treated as a drag.
          if (!moved && Math.hypot(dx, dy) < 4) return;
          moved = true; el.classList.add("dragging");
          el.style.left = (ox + dx) + "px"; el.style.top = (oy + dy) + "px";
        };
        const up = () => {
          el.releasePointerCapture(e.pointerId);
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);

          // A drag snaps to the nearest cell and persists; a tap (no movement)
          // opens the window. Identical on desktop and mobile.
          if (moved) {
            el.classList.remove("dragging");
            const cell = pxToCell(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
            assign(icon, cell.c, cell.r); save();
          } else if (opts.onOpen) opts.onOpen();
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      });

      // Keyboard activation opens the window (dragging is pointer-only).
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (opts.onOpen) opts.onOpen(); } });
      return icon;
    }

    // On resize, relocate any icon now outside the grid and re-place the rest.
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

  // Register the window's launcher icon (label from the titlebar). It is always
  // visible, just like the app icons: tapping it restores the window if it was
  // minimized, otherwise raises it above any open app (focus).
  if (DESK && launcher) DESK.register(launcher, {
    titleEl: $(".titlebar .who"),
    onOpen: () => { if (win && win.classList.contains("hidden")) showWindow(); else WM.focusWebsite(); },
  });

  /* ---------- command palette ---------- */

  const pbg = $("#palette-bg"), pinput = $("#palette-input"), plist = $("#plist");

  // pSel = highlighted result index; pResults = current filtered matches.
  let pSel = 0, pResults = [];

  // Open the palette: reveal it, reset the query, and focus the input.
  function openPalette() { if (!pbg) return; pbg.classList.add("open"); pinput.value = ""; filterPalette(""); pinput.focus(); }
  function closePalette() { if (pbg) pbg.classList.remove("open"); }

  // Filter the file list by a case-insensitive path substring and redraw.
  function filterPalette(q) { q = q.toLowerCase(); pResults = FILES.filter((f) => f.path.toLowerCase().includes(q)); pSel = 0; drawPalette(); }

  // Render the result list, marking the selected row and wiring hover-to-select.
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

    // Arrow keys move the selection, Enter opens it, Escape closes the palette.
    pinput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); pSel = Math.min(pSel + 1, pResults.length - 1); drawPalette(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pSel = Math.max(pSel - 1, 0); drawPalette(); }
      else if (e.key === "Enter") { e.preventDefault(); if (pResults[pSel]) navigate(pResults[pSel].url, true); }
      else if (e.key === "Escape") closePalette();
    });
  }

  // Clicking the dimmed backdrop (but not the panel) closes the palette.
  if (pbg) pbg.addEventListener("click", (e) => { if (e.target === pbg) closePalette(); });
  if ($("#btn-palette")) $("#btn-palette").addEventListener("click", openPalette);
  if ($("#act-search")) $("#act-search").addEventListener("click", openPalette);

  // Global shortcuts: Ctrl/Cmd+K palette, Ctrl/Cmd+B sidebar, Escape dismiss.
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pbg && pbg.classList.contains("open") ? closePalette() : openPalette(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
    else if (e.key === "Escape") {
      closePalette();
      const tb = $("#tabovf");
      if (tb && tb.classList.contains("open")) { closeTabMenu(); tb.focus(); }
    }
  });

  /* ---------- mini-app window manager ----------

     App windows reuse the kernel's window structure and the generic geometry
     helpers above (makeFree/clampGeom/startResize). They are created at runtime
     from the <template>s in base.html, loaded on demand, and torn down on close.
  */

  // Up to MAX_APPS app windows on desktop (a single knob); mobile shows one at a
  // time (close/minimize one to open another).
  const MAX_APPS = 3;

  const tmplWindow = $("#tmpl-window"), tmplDialog = $("#tmpl-dialog");

  // Highest z-index handed out so far; each focus raises a window above the rest.
  // The stage is its own stacking context (z-index:1), so the command palette
  // (a body-level overlay) still sits above every app window.
  let zTop = 40;

  // True when the page was opened directly at an /app/<name>/ URL: the kernel
  // window was minimized at boot and should be restored when the app closes.
  let bootedIntoApp = false;

  // Drag an app window by its titlebar (app windows are born free-floating, so no
  // makeFree dance is needed). `onFocus` raises the window as the drag starts.
  function attachTitlebarDrag(w, onFocus) {
    const tb = w.querySelector(".titlebar");
    if (!tb) return;
    tb.addEventListener("pointerdown", (e) => {
      if (!desktopMode() || e.button !== 0) return;
      if (e.target.closest(".dot, .iconbtn, .right, .win-handle")) return;
      if (onFocus) onFocus();
      const sx = e.clientX, sy = e.clientY, ox = px(w, "left"), oy = px(w, "top");
      w.classList.add("dragging");
      tb.setPointerCapture(e.pointerId);
      const move = (ev) => { w.style.left = (ox + ev.clientX - sx) + "px"; w.style.top = (oy + ev.clientY - sy) + "px"; clampGeom(w); };
      const up = () => {
        tb.releasePointerCapture(e.pointerId);
        tb.removeEventListener("pointermove", move);
        tb.removeEventListener("pointerup", up);
        w.classList.remove("dragging");
      };
      tb.addEventListener("pointermove", move);
      tb.addEventListener("pointerup", up);
    });
  }

  // Center a free window in the stage, with a small cascade so stacked windows
  // don't land exactly on top of each other.
  function placeCenter(w, offset) {
    const s = stage.getBoundingClientRect(), r = w.getBoundingClientRect();
    const d = (offset || 0) * 24;
    w.style.left = Math.max(8, Math.round((s.width - r.width) / 2) + d) + "px";
    w.style.top = Math.max(8, Math.round((s.height - r.height) / 2 - 24) + d) + "px";
    clampGeom(w);
  }

  // Build a standalone dialog (NOT tracked as an app, doesn't count toward
  // MAX_APPS). Returns { el, close }. Backs api.createDialog.
  function createDialog(opts) {
    opts = opts || {};
    const el = tmplDialog.content.firstElementChild.cloneNode(true);
    const t = el.querySelector(".app-title"); if (t) t.textContent = opts.title || "";
    el.style.maxWidth = (opts.maxWidth || 380) + "px";
    if (opts.maxHeight) el.style.maxHeight = opts.maxHeight + "px";
    const body = el.querySelector(".dialog-body"); if (body) body.textContent = opts.message || "";
    const actions = el.querySelector(".dialog-actions");
    const close = () => el.remove();
    (opts.buttons || [{ label: "OK", primary: true }]).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "dlg-btn" + (b.primary ? " primary" : "");
      btn.textContent = b.label || "OK";
      btn.addEventListener("click", () => { if (b.onClick) b.onClick(); if (!b.keepOpen) close(); });
      actions.appendChild(btn);
    });
    const x = el.querySelector("[data-win-close]"); if (x) x.addEventListener("click", close);
    el.style.left = el.style.top = "-9999px";
    stage.appendChild(el);
    el.style.zIndex = (zTop += 1);
    attachTitlebarDrag(el, () => { el.style.zIndex = (zTop += 1); });
    placeCenter(el);
    return { el, close };
  }

  // The window manager: owns every app window plus the focus / z-order / URL rules.
  const WM = {
    apps: [],   // [{ name, url, el, mod, api, kind, focusedAt, _themeCbs }]

    byName(name) { return this.apps.find((r) => r.name === name); },

    // Frontmost visible app (most recently focused), or null.
    topVisible(except) {
      return this.apps
        .filter((r) => r !== except && !r.el.classList.contains("hidden"))
        .reduce((a, b) => (!a || b.focusedAt > a.focusedAt ? b : a), null);
    },

    // Raise a window, mark it focused, and point the address bar at it. Focus
    // changes use replaceState only, so they never add history entries.
    focus(rec) {
      if (!rec) return;
      rec.el.classList.remove("hidden");
      rec.el.style.zIndex = (zTop += 1);
      rec.focusedAt = Date.now();
      this.apps.forEach((r) => r.el.classList.toggle("focused", r === rec));
      try { history.replaceState({ url: CURRENT.url, app: rec.name }, "", rec.url); } catch (e) {}
    },

    // Raise the kernel website window above the apps and make it the focused
    // surface again. The kernel draws from the same `zTop` pool as apps, so
    // clicking the website brings it over any open app (and clicking an app
    // brings that back over the website). Desktop only: on mobile an app is
    // full-screen and the website is reached by closing/minimizing the app.
    focusWebsite() {
      if (!desktopMode()) return;
      win.style.zIndex = (zTop += 1);
      this.apps.forEach((r) => r.el.classList.remove("focused"));
      this.restoreWebsiteUrl();
    },

    // Open (or focus) an app by name. `url` is its /app/<name>/ address.
    launch(name, url) {
      url = url || ("/app/" + name + "/");
      const open = this.byName(name);
      if (open) { this.focus(open); return; }

      // Enforce the concurrency cap (1 on mobile, MAX_APPS on desktop) with LRU
      // eviction: opening past the cap closes the least-recently-focused app.
      const cap = desktopMode() ? MAX_APPS : 1;
      while (this.apps.length >= cap) {
        const lru = this.apps.reduce((a, b) => (a.focusedAt <= b.focusedAt ? a : b));
        this.close(lru);
      }

      import("/apps/" + name + ".js").then((m) => {
        const mod = m && m.default;
        if (!mod || typeof mod.mount !== "function") throw new Error("bad app module: " + name);
        const rec = buildApp(name, url, mod);
        try { mod.mount(rec.el, rec.api); } catch (e) { console.error(e); }
        tick();
        this.apps.push(rec);
        placeCenter(rec.el, this.apps.length - 1);
        this.focus(rec);
      }).catch((err) => { console.error("Failed to load app '" + name + "':", err); });
    },

    // Minimize: hide the window; its always-present desktop icon reopens it.
    minimize(rec) {
      rec.el.classList.add("hidden");
      const next = this.topVisible(rec);
      if (next) this.focus(next); else this.restoreWebsiteUrl();
    },

    // Close: unmount, drop the DOM and references, then refocus whatever is now
    // frontmost (another app, or the website).
    close(rec) {
      try { rec.mod.unmount && rec.mod.unmount(); } catch (e) { console.error(e); }
      if (rec._themeCbs) rec._themeCbs.forEach((cb) => appThemeCbs.delete(cb));
      rec.el.remove();
      this.apps = this.apps.filter((r) => r !== rec);
      const top = this.topVisible(null);
      if (top) this.focus(top);

      // Direct-boot case: the website was only ever the empty app stub, so reveal
      // it and load the real home page (clean content + URL).
      else if (bootedIntoApp) {
        bootedIntoApp = false; showWindow();
        navigate((FILES[0] && FILES[0].url) || "/", true);
      } else this.restoreWebsiteUrl();
    },

    // Point the address bar back at the underlying website page.
    restoreWebsiteUrl() {
      try { history.replaceState({ url: CURRENT.url }, "", CURRENT.url); } catch (e) {}
    },
  };

  // Clone the right shell, fill the title/size slots, wire chrome, and return the
  // app record. The whole window element is passed to mount() as `host`, so an
  // app can target .dialog-body / .dialog-actions / .app-host as it needs.
  function buildApp(name, url, mod) {
    const meta = mod.meta || {};
    const kind = meta.kind === "window" ? "window" : "dialog";
    const tmpl = kind === "window" ? tmplWindow : tmplDialog;
    const el = tmpl.content.firstElementChild.cloneNode(true);

    const titleEl = el.querySelector(".app-title");
    if (titleEl) titleEl.textContent = meta.title || name;

    // Window-kind apps get a default size; dialogs size to their content. Both
    // honor optional maxWidth/maxHeight ("phone on a desktop").
    if (kind === "window") {
      el.style.width = Math.min(meta.maxWidth || 760, 760) + "px";
      el.style.height = Math.min(meta.maxHeight || 540, 540) + "px";
    }
    if (meta.maxWidth) el.style.maxWidth = meta.maxWidth + "px";
    if (meta.maxHeight) el.style.maxHeight = meta.maxHeight + "px";

    // Start off-screen to avoid a flash at 0,0 before placeCenter runs.
    el.style.left = el.style.top = "-9999px";
    stage.appendChild(el);

    const rec = { name, url, el, mod, kind, api: null, focusedAt: Date.now(), _themeCbs: [] };
    rec.api = makeApi(rec);

    const closeBtn = el.querySelector("[data-win-close]");
    if (closeBtn) closeBtn.addEventListener("click", () => WM.close(rec));
    const minBtn = el.querySelector("[data-win-min]");
    if (minBtn) minBtn.addEventListener("click", () => WM.minimize(rec));

    // Clicking anywhere on the window raises it; the titlebar drags it; window
    // apps also get the eight resize grips.
    el.addEventListener("pointerdown", () => WM.focus(rec), true);
    attachTitlebarDrag(el, () => WM.focus(rec));
    if (kind === "window") addResizeGrips(el);
    return rec;
  }

  // The kernel-provided API handed to each app's mount(). Small on purpose.
  function makeApi(rec) {
    return {
      close: () => WM.close(rec),
      title: (t) => { const el = rec.el.querySelector(".app-title"); if (el) el.textContent = t; },
      theme: () => document.documentElement.dataset.theme,
      onThemeChange: (cb) => { if (typeof cb === "function") { appThemeCbs.add(cb); rec._themeCbs.push(cb); } },
      createDialog: (opts) => createDialog(opts),
    };
  }

  // The kernel website window joins the same z-order as the apps: a pointerdown
  // anywhere on it raises it above any open app window (desktop only).
  if (win) win.addEventListener("pointerdown", () => WM.focusWebsite(), true);

  // Register the per-app desktop icons (always visible) to launch their apps.
  if (DESK) document.querySelectorAll("#desktop .desk-icon[data-app]").forEach((el) => {
    const name = el.dataset.app, url = el.dataset.appUrl || ("/app/" + name + "/");
    DESK.register(el, { onOpen: () => WM.launch(name, url) });
  });

  /* ---------- boot ---------- */

  // Apply the stored (or default) theme and wire up the tree.
  setTheme(document.documentElement.dataset.theme || "ink");
  attachFolderToggles();

  // First paint of all the per-page chrome.
  markTree(); renderTabs(); renderCrumb(); setStatus(); decorateLinks(); enhanceCode(); updateSeg();

  // Seed history so back/forward returns to this page.
  history.replaceState({ url: CURRENT.url }, "", location.href);
  tick();

  // The clock only shows HH:MM, so update once per minute, aligned to the boundary.
  (function scheduleTick() { setTimeout(() => { tick(); scheduleTick(); }, 60000 - (Date.now() % 60000)); })();

  // Start collapsed when the sidebar is in overlay mode.
  if (isOverlay() && sidebarEl) { sidebarEl.classList.add("collapsed"); wasOverlay = true; }

  // Direct /app/<name>/ load: minimize the website window behind and open the
  // app over it ("website closes, app opens").
  const bootApp = document.body.dataset.app;
  if (bootApp) { bootedIntoApp = true; hideWindow(false); WM.launch(bootApp, location.href); }
})();
