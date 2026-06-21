+++
title = "Turning my site into a tiny operating system"
date = 2026-06-09
description = "How vss.dev works today as a static, server-rendered editor, and how I'm adding mini-apps that load on click, open in their own windows, and clean up after themselves."
authors = ["Victor Santos"]
[taxonomies]
tags = ["meta", "frontend"]
[extra]
filename = "building-mini-apps.md"
icon = "md"
+++

# Turning my site into a tiny operating system

This site already pretends to be a code editor. Now I'm going to let it
run small programs, and I want to walk through the plan the way I'd
explain it to myself on day one of the job: slowly, with the jargon
unpacked as we go.

If you're early in your career, this post is for you. By the end you'll
know how the site is built today and how the new "mini-apps" will fit on
top of it without breaking anything.

## First, how the site works today

### It's a static site

A *static site* means there's no server running my code when you visit.
Every page was turned into a plain HTML file ahead of time by a tool
called a *static site generator* (I use [Zola](https://www.getzola.org/)).
I write my content as markdown files, Zola converts them to HTML once, and
a plain file host serves those files. No database, no backend, no waiting.

Why bother? Three reasons: it's fast (you're just downloading a file),
it's cheap to host, and it's great for *SEO*. SEO ("search engine
optimization") is just "can Google read and rank my page." Because the
real words live in the HTML from the start, search engines see everything
without running any JavaScript.

### The HTML is wrapped in an "editor" look

Every page is rendered *inside* a window that looks like a code editor: a
title bar with the little traffic-light buttons, a file tree on the left,
tabs, and a status bar at the bottom. That wrapper (the "chrome") lives in
my page templates. The important part: the actual article text is right
there in the HTML, and the editor look is wrapped around it.

### JavaScript makes it feel like an app, but it's optional

On top of the static HTML I add a layer of JavaScript (`editor.js`). It
upgrades the page after it loads: clicking a file swaps the content
without a full reload, the command palette opens, the theme toggles, the
window can be dragged. This pattern has a name: *progressive enhancement*.
The page works as plain HTML for a search engine or a browser with
JavaScript off, and gets nicer when the script runs.

There's one more idea worth naming. Right now there is exactly **one**
window: the website itself. You can minimize it (it shrinks to an icon on
the desktop) and bring it back. Hold onto that idea, because the new
system reuses it.

## The new idea: mini-apps

I want to add small programs to the site. The first one is a "Hello
World" app, because everything starts with a hello world. It just opens a
little dialog box that says "Hello World!" with a close button.

Here are the rules I set for myself:

- The **website stays exactly as it is**. Think of the website as the
  *kernel*. In a real computer, the kernel is the always-on core that you
  can't shut down. My website is that: always present, always indexable by
  search engines, never unloaded.
- **Apps are loaded only when clicked.** They never load "just in case."
- **When you close an app, it's gone from memory.** No leftovers.
- **Each app has its own web address**, like `/app/helloworld`. If you
  paste that link, the app opens.

## The building blocks

Let me break the plan into pieces and explain each one in plain terms.

### 1. A shared window

Today's editor window is custom-built for the website. I'm going to pull
out a reusable, stripped-down version of it that any app can use: a title
bar (no search box), a content area in the middle, and a status bar with
just a clock. Apps render their stuff into the middle.

I'll also let a window declare a maximum width and height. That way an app
can choose to open small, like a phone-sized window sitting on a desktop,
instead of filling the screen.

### 2. A dialog

A *dialog* is just a smaller, simpler window: a title bar, a message, and
one or more buttons. No status bar. My Hello World app is literally just a
dialog that says "Hello World!" and has a Close button. Starting this
small keeps the first version honest.

### 3. A window manager

Once more than one window can exist, something has to keep them in order.
That "something" is a *window manager* (every desktop operating system has
one). Mine needs to:

- Let windows be dragged around and stacked on top of each other.
- Track which window is in front (the "focused" one).
- Enforce limits. On a desktop I'll allow up to **3** apps open at once
  (a single setting I can change later). On mobile, where the screen is
  small, only **one** app at a time: you close or minimize one to open
  another.

### 4. Apps as "modules" that load on demand

Here's the part that makes apps feel separate from the site. Each app is
its own JavaScript file (a *module*). Instead of bundling every app into
the site's main script, I load an app's file only when you open it, using
something the browser gives us called *dynamic import* (`import(...)`).
"Dynamic" just means "at the moment I need it," not up front.

Every app follows the same small contract, so the kernel knows how to talk
to it:

```js
export default {
  meta: { title: "Hello World", kind: "dialog" },
  mount(host, api) { /* draw yourself into `host` */ },
  unmount() { /* clean up timers and listeners */ },
};
```

When you open an app, the kernel calls `mount` and hands it a spot to draw
into. When you close it, the kernel calls `unmount`, removes its HTML, and
drops every reference to it so the browser's garbage collector can reclaim
the memory.

One honest caveat, because I'd rather you learn the real version: once a
browser downloads a module's code, it keeps that *code* cached for the
life of the page. So "removed from memory" means the app's running state,
its on-screen elements, and its event listeners are all destroyed. The few
kilobytes of code text stay cached. For real isolation you'd use an
iframe, but that's heavier than this project needs right now.

### 5. Addresses for apps

Because the site is static, a web address only exists if a file produces
it. So each app gets one tiny generated page at its address (for example
`/app/helloworld`). That page isn't meant for Google (I mark it
"noindex"); it exists so the link works if you visit it directly. When you
do, the kernel notices, tucks the website away, and opens the app.

### 6. Launching from the desktop

The site already has a draggable desktop-icon system (it's how you reopen
the window after minimizing it). I'll reuse it: each app gets an icon on
the desktop, and clicking it opens the app. No new machinery, just one
more use of something that already works.

## The trickiest decision: one address bar, many windows

A browser has only **one** address bar, but on desktop I might have three
app windows open. Which address shows?

The answer I picked: the address bar follows whichever window is **in
front**. Click a different window and the address updates to that app's
link, so any open window is always shareable. The subtle part is browser
*history* (the Back button). I deliberately do **not** add a history entry
every time you open, focus, or close a window, because with three windows
the Back button would become a guessing game. Instead, opening and closing
apps just quietly updates the address, and Back/Forward keep doing what
they always did: moving through the website's pages underneath. You close
an app with its own close button, the way you'd close a window on a real
desktop.

## The first milestone

The whole plan above is the destination. The first commit is small on
purpose: a desktop icon that opens a Hello World dialog, and a
`/app/helloworld` link that does the same. Once that works end to end, the
window manager and the app contract are proven, and the next apps (with
real, dynamic content) are just more modules dropped into the same slot.

That's the fun of treating your own site like a tiny operating system: the
hard part is the foundation, and every app after the first one gets to be
easy.
