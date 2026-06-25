+++
title = "vss.dev"
date = 2026-05-30
weight = 1
description = "Why my personal site is an editor you can browse, built with Zola, with no front-end framework and content kept as plain markdown."
authors = ["Victor Santos"]
[taxonomies]
tags = ["vss.dev", "meta", "frontend"]
[extra]
filename = "vss-dev.md"
icon = "md"
+++

{% notice() %}This post is a work in progress and will be updated soon.{% end %}

# Building vss.dev as a code editor

I wanted my site to *be* the thing it talks about. So instead of a hero section and a wall of buzzwords, you're looking at an editor (recognize which one?), and everything here is a file you can open.

## The constraint that made it fun

Content is plain markdown. The pages are pre-rendered to static HTML by [Zola](https://www.getzola.org), so there's no front-end framework and no client-side rendering to wait on. If I'm going to put this on a résumé, the source should be as honest as the content: view-source and it's all right there.

That meant writing the editor chrome myself, including a file tree, tabs, a command palette, and a syntax highlighter for the source view:

```js
function openFile(path) {
  if (!tabs.includes(path)) tabs.push(path);
  active = path;
  render();
}
```

## How it's built: plain HTML first, then progressive enhancement

Every page is served as plain, complete HTML first. The full article is right there in the source before a single line of JavaScript runs, which is what mainly keeps search engines happy, but it also means the site works in browsers with JavaScript disabled. The content never depends on the script.

Then progressive enhancement brings the website to life on top of that static base: the editor chrome, the file tree, tabs, the command palette, in-place navigation, and more. The script is purely additive. If it never loads, you still get the whole site.

There's a lot of cool and advanced stuff coming to this home. Really advanced stuff. The rule is that none of it gets in the way of the search engines: the indexable layer stays plain HTML, and everything fancy layers on top without touching it. The goal is to keep this site as close as possible to a perfect 100 SEO score, no matter how much I build on it.

## The one detail I care about

The editor chrome is monospaced. That's the costume. But the moment you read a post, the words are set in a serif. Code is for machines; writing is for people. Letting those two voices sit side by side is the whole idea.

## What I'd tell past me

- Ship the small version. A site you launch beats a redesign you don't.
- Constraints are a gift. "Plain markdown, no framework" killed a hundred decisions.
- Make the thing you'd want to find.

Want the short version of how I work? Read [the five-minute rule](/tips/the-five-minute-rule/).

## Posts about this project

Everything I've written while building vss.dev lives under the [#vss.dev](/tags/vss-dev/) tag.
