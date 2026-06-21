+++
title = "Building vss.dev as a code editor"
date = 2026-05-30
description = "Why my personal site is an editor you can browse, built with Zola, with no front-end framework and content kept as plain markdown."
authors = ["Victor Santos"]
[taxonomies]
tags = ["meta", "frontend"]
[extra]
filename = "building-vss-dev.md"
icon = "md"
+++

# Building vss.dev as a code editor

I wanted my site to *be* the thing it talks about. So instead of a hero
section and a wall of buzzwords, you're looking at an editor, and every
part of me is a file you can open.

## The constraint that made it fun

Content is plain markdown. The pages are pre-rendered to static HTML by
[Zola](https://www.getzola.org), so there's no front-end framework and
no client-side rendering to wait on. If I'm going to put this on a
résumé, the source should be as honest as the content: view-source and
it's all right there.

That meant writing the editor chrome myself, including a file tree, tabs,
a command palette, and a syntax highlighter for the source view:

```js
function openFile(path) {
  if (!tabs.includes(path)) tabs.push(path);
  active = path;
  render();
}
```

## The one detail I care about

The editor chrome is monospaced. That's the costume. But the moment you
read a post, the words are set in a serif. Code is for machines; writing
is for people. Letting those two voices sit side by side is the whole
idea.

## What I'd tell past me

- Ship the small version. A site you launch beats a redesign you don't.
- Constraints are a gift. "Plain markdown, no framework" killed a hundred decisions.
- Make the thing you'd want to find.

Want the short version of how I work? Read [the five-minute rule](/tips/the-five-minute-rule/).
