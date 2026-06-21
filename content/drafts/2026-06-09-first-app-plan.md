+++
title = "Plan: Mini-apps platform (kernel + window manager + Hello World)"
date = 2026-06-09
[extra]
filename = "2026-06-09-first-app-plan.md"
icon = "md"
+++

# Plan: Mini-apps platform (kernel + window manager + Hello World)

## Context

`vss.dev` is a Zola static site rendered as a code-editor "window" (the **kernel** /
website app). Victor wants to add **mini-apps**: lazy-loaded JS modules that open in
their own window/dialog over the website, each with its own URL (`/app/<name>/`). The
first is a **Hello World** dialog, a test bed before real, dynamic-content apps arrive.

The website app must keep working **exactly as today** (server-rendered, SEO-indexable,
never unloaded). Apps are the opposite: never preloaded, loaded on click, fully torn
down on close.

Decisions captured from planning:
- **App model:** ES module + `mount/unmount` lifecycle (state/DOM/listeners freed on close;
  module code stays in the browser registry, which is acceptable).
- **Windows:** responsive WM. **Desktop:** up to `MAX_APPS` (default **3**, single
  configurable constant) concurrent app windows, draggable and overlapping like an OS,
  with focus/z-order. **Mobile:** one app window at a time (minimize/close to reach the
  launcher and open another).
- **Launch UI:** desktop icons.
- **App SEO:** not needed. App routes are minimal boot stubs with `noindex`.

## Architecture overview

- Every served URL stays the **kernel** (`base.html` chrome), server-rendered. Apps open
  *over* it as additional `.window` elements created at runtime by JS.
- A generalized **Window Manager (WM)** owns all windows (the kernel window + app windows):
  drag, minimize, close, focus/z-order, and the desktop/mobile concurrency rules. It
  generalizes the single-window code that already exists in `static/editor.js`.
- **Factories** `createWindow(opts)` and `createDialog(opts)` build windows from
  `<template>`s in `base.html`, reusing existing CSS classes. Both support optional
  `maxWidth` / `maxHeight` ("phone on a desktop").
- **App loader** dynamically `import()`s `/apps/<name>.js` on demand, mounts it into a
  window/dialog's content host, and destroys it on close.
- **Routing:** clicking an app icon or hitting `/app/<name>/` directly launches the app
  via the WM (no content swap); back/forward (popstate) opens/closes apps accordingly.

## 1. Shared window / dialog shell

Add two `<template>`s to `templates/base.html` as the single source of truth (the kernel's
own `.window` stays as-is for SEO; app windows are cloned from these):

- `#tmpl-window`: `.window.free.app` › `.titlebar`(`.dots` close/min + `.who` title +
  optional `.right` slot) + `.body` › `.main`(content host) + `.statusbar`(clock at right,
  reusing `#st-clock` styling). **No** sidebar, activity bar, or search — matching the
  requested shared window.
- `#tmpl-dialog`: `.window.free.app.dialog` › `.titlebar`(title + close) +
  `.dialog-body`(message host) + `.dialog-actions`(button row). **No** statusbar.

CSS: mostly reuse. App windows reuse `.window`, `.window.free` (absolute, draggable),
`.titlebar`, `.dots`, `.statusbar`. Add a small block in `static/editor.css` for
`.window.app` (z-order/focus ring via `.window.focused`), `.window.dialog`,
`.dialog-body`, `.dialog-actions`, and `maxWidth/maxHeight` applied inline by the factory.

## 2. Window Manager (generalize existing code in `static/editor.js`)

Refactor today's single-window helpers to operate on **any** `.window`, then add a manager:

- Reuse/generalize: `makeFree`/`clampGeom` ([editor.js:649](static/editor.js),
  [:661](static/editor.js)), `startResize` + grip creation ([:698](static/editor.js),
  [:741](static/editor.js)), the titlebar drag handler ([:672](static/editor.js)), and the
  minimize→launcher pattern (`hideWindow`/`showWindow`, [:773](static/editor.js),
  [:787](static/editor.js)).
- New `WM` with: `windows[]`, `focus(win)` (raise z-index, set `.focused`), `register(win)`,
  `unregister(win)`, and concurrency policy:
  - `const MAX_APPS = 3;` (desktop). Mobile uses the existing `mqMobile`
    ([:639](static/editor.js)) → effective max **1** app window.
  - Over-limit policy (default, easily changed): **LRU eviction** — opening beyond the cap
    closes the least-recently-focused app window first. Relaunching an already-open app
    just focuses it.
- The kernel website window registers with `WM` too (so focus/z-order is uniform) but is
  flagged non-closable/non-unloadable; its "close" keeps today's reset-to-first-visit.

## 3. App module system & lifecycle

- App files live in `static/apps/<name>.js`, served at `/apps/<name>.js`.
- **Contract:**
  ```js
  export default {
    meta: { title, kind: "window"|"dialog", maxWidth, maxHeight },
    mount(host, api) { /* render into host */ },
    unmount() { /* tear down timers/listeners */ },
  };
  ```
- **`api`** passed to `mount` (built by the kernel): `{ close(), createDialog(opts),
  theme(), onThemeChange(cb), title(text) }` — enough for Hello World, room to grow.
- **launch(name):** if open → `focus`; else enforce limit, `import('/apps/'+name+'.js')`,
  create window/dialog per `meta.kind`, call `mount(host, api)`, `pushState('/app/'+name+'/')`.
- **close:** `unmount()` → remove DOM → `WM.unregister` → drop references (instance/host GC'd).

## 4. Routing & URLs (Zola + SPA)

- Add `templates/app.html`: extends `base.html`, sets `<body data-app="{{ page.extra.app }}">`,
  `<meta name="robots" content="noindex">`, and a minimal placeholder/`<noscript>` body
  (apps aren't indexed). It still renders the kernel chrome so the page is the live kernel.
- Add `content/app/_index.md` (section; `render = true`, no listing needed) and
  `content/app/helloworld.md` (front matter: `template = "app.html"`, `[extra] app =
  "helloworld"`, optional `maxWidth/maxHeight`). Produces `/app/helloworld/`.
- **Boot:** in `static/editor.js` boot, read `document.body.dataset.app`; if set, minimize
  the website window (existing `hideWindow`) and `WM.launch(app)` — "website closes, app
  opens." (Default; trivially switchable to "leave website open behind".)
- **Intercept nav:** extend the global click handler / `navigate()`
  ([:517](static/editor.js), [:550](static/editor.js)) so same-origin `/app/<name>/` links
  call `WM.launch` instead of fetching+swapping content. Extend `popstate`
  ([:542](static/editor.js)) to open/close apps as the URL changes.
- **Closing an app** navigates back to the prior site URL (or `/`) and restores the website
  window if it was minimized.

## 5. Desktop launch icons

- The snap-grid desktop (`DESK`, [editor.js:830](static/editor.js)) already exists and is
  visible around/behind the window on desktop (and reachable by minimizing on mobile).
- Render one `.desk-icon` **per app**, server-side in `base.html`'s `#desktop` layer by
  iterating the `content/app` section pages (so the icon list is data-driven). These icons
  are **always shown** (unlike `#icon-window`, which only appears when the website window is
  hidden). `DESK.register(icon, { onOpen: () => WM.launch(name) })` reuses the existing
  drag/tap-to-open behavior we just unified.

## 6. Hello World app (`static/apps/helloworld.js`)

```js
export default {
  meta: { title: "Hello World", kind: "dialog", maxWidth: 380 },
  mount(host, api) {
    host.querySelector(".dialog-body").textContent = "Hello World!";
    // single "Close" button wired to api.close()
  },
  unmount() {},
};
```
Opens a dialog (simple titlebar, "Hello World!" message, Close button), draggable and
focusable via the WM, counts as one of the desktop's `MAX_APPS`.

## Files

**Add**
- `templates/app.html` — app boot-stub template (noindex, `data-app`).
- `content/app/_index.md`, `content/app/helloworld.md` — the `/app/helloworld/` route.
- `static/apps/helloworld.js` — first app module.

**Modify**
- `templates/base.html` — add `#tmpl-window` + `#tmpl-dialog`; render per-app desktop icons.
- `static/editor.js` — generalize windowing into the WM; add `createWindow`/`createDialog`,
  app loader/lifecycle, `MAX_APPS`, app-route boot + nav/popstate interception.
- `static/editor.css` — `.window.app`/`.focused`, `.window.dialog`, `.dialog-body`,
  `.dialog-actions`; ensure app windows work in the existing mobile/full-screen rules.

## Verification

Run `zola serve` and, in the browser:
1. **Launch:** desktop icon → Hello World dialog shows "Hello World!" + Close; Close removes
   it from the DOM (confirm via devtools: node + listeners gone).
2. **Direct URL:** load `/app/helloworld/` → website window minimizes, dialog opens;
   `<meta robots noindex>` present; back button returns to the website.
3. **Multi-window (desktop):** open up to 3 app windows; drag/overlap; click to focus
   (z-order changes); opening a 4th evicts the least-recently-focused (LRU).
4. **Mobile (≤840px):** only one app window at a time; minimize/close reveals the desktop
   launcher to open another.
5. **Regression:** the website app is unchanged — tabs, palette, sidebar, source view,
   theme, and existing SEO content all still work; `view-source` of a normal page still has
   server-rendered prose.

## Defaults chosen (easily reversible, flag if you'd prefer otherwise)
- Over-limit on desktop → **LRU eviction** of the oldest app window.
- Direct `/app/<name>/` boot → **minimize the website window** (matches "website closes").
- `MAX_APPS = 3` as a single top-of-file constant.