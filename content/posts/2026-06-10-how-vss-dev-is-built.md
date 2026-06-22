+++
title = "How vss.dev is built: a static site that runs apps"
date = 2026-06-10
description = "A technical tour of vss.dev: how it was structured before, how the window manager and mini-apps work now, and why an app runtime layered on top never cost it any SEO."
authors = ["Victor Santos"]
draft = true
[taxonomies]
tags = ["vss.dev", "meta", "frontend"]
[extra]
filename = "how-vss-dev-is-built.md"
icon = "md"
+++

# How vss.dev is built: a static site that runs apps

This is the mechanism-level companion to [Turning my site into a tiny operating system](/posts/building-mini-apps/). That post explained the idea. This one opens the hood: how the site was structured before, how it is structured now, how the mini-apps actually load and tear down, and why bolting an app runtime on top never cost me any search-engine visibility.

It is more technical, but I have tried to keep every term unpacked.

## The shape of the thing: a static site wearing an editor

The whole site is built by [Zola](https://www.getzola.org/), a static site generator. Markdown in `content/` becomes HTML at build time. There is no backend, no database, and no server running my code when you visit. From `config.toml`:

- `generate_feeds = true` (RSS), `sitemap.xml` generated automatically, `taxonomies = tags`
- `build_search_index = false` (search is client-side, more on that below)
- Code highlighting is deliberately not done at build time

One template, `base.html`, is the entire "editor" chrome: the title bar with traffic-light dots, the activity bar, the file tree, the tabs, the status bar. Every page type (a page, a section, a tag listing) resolves an "active file" at the top of that template and renders its content *inside* the window. So the editor look is a wrapper, and the article text is real HTML underneath it.

The framing that makes everything else click: the website is the *kernel*. Always present, always server-rendered, never unloaded. Everything else layers on top of it without touching it.

## Before: one window, hardcoded

Originally there was exactly one window: the website. `editor.js` had single-window helpers (drag, resize, minimize, maximize, close) wired directly to the one `.window` element. Navigation between pages was already a lightweight in-place swap, but there was only ever one surface.

The progressive-enhancement contract was set from day one:

- The server sends complete HTML. The prose lives in `<article id="preview">`.
- `editor.js` is a classic `<script defer>` IIFE that *upgrades* the page after it loads.
- Turn JavaScript off and you still get the full article. The script is additive.

```html
<!-- base.html, end of body -->
<script src="/editor.js" defer></script>
```

That single constraint, "the page must work as plain HTML," is what later made the mini-apps safe for SEO. The indexable layer never depended on JavaScript, so adding a JavaScript app runtime on top could not regress it.

## Now: one window manager, many windows, the kernel is just one of them

The current structure generalizes that single window into a *window manager* that owns every window in one list, including the website itself:

```js
const WM = {
  windows: [],                 // every window, kernel + apps
  apps() { return this.windows.filter(r => r.kind !== "website"); },
  focus(rec) { /* restack z-index, mark focused, update URL */ },
  launch(name, url) { /* lazy-import + mount an app */ },
  close(rec) { /* the permanent kernel resets; apps tear down */ },
  // ...
};
```

The website is registered like any app, with one flag that makes it permanent:

```js
websiteRec = WM.register({
  name: "website", kind: "website", el: win, closable: false,
  url: () => CURRENT.url, onClose: () => hideWindow(true),
});
```

The payoff: there is now one code path for dragging a titlebar, one for focus and z-order, one for wiring the close/minimize/maximize dots. The kernel used to keep its own private copy of each. The only thing special about the website is `closable: false`. Closing it resets it to a fresh first visit instead of destroying it. No other privileges.

Two small details worth naming:

- **Z-index is bounded, not a runaway counter.** Focusing a window re-packs all windows into a tiny fixed band (starting at 40) sorted by recency, instead of incrementing a number forever. Dialogs sit at a fixed band above windows.
- **Concurrency cap with LRU eviction.** Desktop allows three app windows, mobile allows one (a `max-width: 840px` media query decides). Opening past the cap closes the least-recently-focused app.

## How the in-place navigation actually works

`navigate(url, push)` is the single choke point for all movement inside the site: link clicks, the command palette, and the browser's Back and Forward buttons.

```js
function navigate(url, push) {
  const abs = new URL(url, location.href).href;
  const appName = appNameForUrl(abs);
  if (appName) { closePalette(); WM.launch(appName, abs); return; } // app URL -> launch
  // ... otherwise fetch the page and swap content in place ...
}
```

The fetch path:

1. `fetch(abs, { headers: { "X-Requested-With": "fetch" } })`
2. Parse the returned HTML with `DOMParser`
3. Copy `#preview` innerHTML and the raw markdown from `#rawmd`
4. Rewrite the head tags client-side: `<title>`, meta description, canonical, and the Open Graph URL, title, and description
5. Re-run the per-page decorators: tree, tabs, breadcrumb, status bar, link decoration, code highlighting, view toggle
6. `pushState` (or, on a Back/Forward event, nothing) so the URL stays shareable

A monotonic counter guards against out-of-order responses, and any failure falls back to a real full-page navigation. So even the in-place layer degrades gracefully.

## The file tree, tabs, and command palette run off a tiny manifest

There is no server search index. Instead the template emits a small JSON array of every content file:

```html
<script>
window.FILES = [
  { name:"README.md", path:"README.md", url:"/" },
  { name:"vss-dev.md", path:"projects/vss-dev.md", url:"/projects/vss-dev/" },
  // ... generated by looping the Zola sections ...
];
</script>
```

The command palette (Ctrl/Cmd+K) is a case-insensitive substring filter over `FILES`. The file tree and the tab system read from the same array. That is why `build_search_index = false` in the config: the "search" is a few kilobytes of client-side filtering, no heavyweight index needed.

The source view is similar. The raw markdown is embedded at build time:

```html
<script type="text/markdown" id="rawmd">{{ load_data(path="content/posts/...") }}</script>
```

Front matter is stripped client-side, and syntax highlighting is a small regex tokenizer that runs in the browser. Highlighting client-side rather than at build time is a deliberate choice: the colors come from CSS variables, so the same highlighted code adapts to both the ink and paper themes. Build-time colors baked into the HTML could not do that.

## How a mini-app works, end to end

**The contract.** Every app is an ES module with one default export:

```js
export default {
  meta: { title: "Hello World", kind: "dialog", maxWidth: 380 },
  mount(host, api) { /* render into host */ },
  unmount() { /* tear down timers and listeners */ },
};
```

`kind` is `"window"` (a full app window with a status bar) or `"dialog"` (a small box). The real Hello World is about twenty lines: it sets some text and wires a Close button.

**Lazy loading.** An app's code is never shipped with the site. It loads only when you open it, through a dynamic import:

```js
import("/apps/" + name + ".js").then((m) => {
  const rec = buildApp(name, url, m.default);
  m.default.mount(rec.el, rec.api);
  this.register(rec);
  this.focus(rec);
});
```

**The shell** comes from `<template>` elements in `base.html`, cloned at runtime, reusing the exact same window and titlebar and status-bar CSS as the kernel.

**The api** handed to `mount` is intentionally tiny: `close`, `title`, `theme`, `onThemeChange`, and `createDialog`.

**Teardown.** Closing an app calls `unmount()`, removes the DOM node, and drops every reference so the browser can garbage-collect it. One honest caveat, since I would rather you learn the real version: the module's *code text* stays cached for the life of the page. The running state, the on-screen elements, and the event listeners are all destroyed, but the few kilobytes of code stay. True sandboxing would need an iframe, which is heavier than this project needs.

**Addresses.** Because the site is static, a URL only exists if a file generates it. So each app gets a tiny stub page:

```toml
# content/app/helloworld.md
title = "Hello World"
template = "app.html"
[extra]
app = "helloworld"
hidden = true
```

`app.html` extends `base.html`, so visiting `/app/helloworld/` renders the real kernel chrome. The body is just `<noscript>The Hello World mini-app needs JavaScript to run.</noscript>`. On boot, `editor.js` reads `document.body.dataset.app`, minimizes the kernel, and launches the app. And because `navigate()` recognizes `/app/<name>/` URLs, deep links, in-page link clicks, and Back or Forward onto an app URL all launch the app instead of rendering that stub.

## The part that ties it together: it is still fully indexable

This is the most counterintuitive piece. The site grew an entire app runtime and kept clean SEO. The reasons, concretely:

1. **Static pre-rendering.** Every real page's words are in the HTML at build time. Crawlers get the full content without running a line of JavaScript. View-source on any post and the prose is right there.

2. **Progressive enhancement as a firewall.** `editor.js` only ever adds behavior. The indexable surface, the server-rendered prose, never depends on it. That is exactly why adding mini-apps was safe: apps are a JavaScript-only layer over the kernel, and the kernel is the static, indexable thing at every real URL.

3. **Per-page server-rendered head and structured data.** The template emits, for every page, a unique title, meta description, canonical link, Open Graph and Twitter cards, and JSON-LD: `Person` on the home page, `BlogPosting` on dated posts, `WebPage` otherwise.

4. **noindex discipline on the app layer.** The boot stubs under `/app/` and any hidden routes are marked `noindex, nofollow`:

   ```jinja
   {% set noindex = (page and page.extra.app) or (page and page.extra.hidden) or (section and section.extra.hidden) %}
   <meta name="robots" content="{% if noindex %}noindex, nofollow{% else %}index, follow{% endif %}">
   ```

So the empty app stubs never compete in the index, while real content stays fully indexable. The app routes exist purely so that the links resolve.

5. **The freebies from a static generator.** Automatic `sitemap.xml`, RSS feeds, per-tag feeds, and canonical URLs.

6. **Performance hygiene, which is itself a ranking signal.** A tiny inline theme script runs before paint to avoid a flash, fonts use `preconnect`, the main script is deferred, and there is no framework runtime to download or hydrate.

The one-line thesis: the indexable website and the interactive app runtime are two separate layers. The bottom layer is plain static HTML that any crawler reads. The top layer is JavaScript-only, opt-in, and marked noindex. Adding apps never touched the layer search engines see.

## Closing

That is the fun of treating your own site like a tiny operating system: the hard part is the foundation, and every app after the first one gets to be easy. The foundation here is boring on purpose. Static HTML, one window manager, one navigation choke point, and a strict rule that the indexable layer never depends on a script. Boring foundations are what let the top of the stack get weird.
