+++
title = "Choosing the page title (and losing a morning to it)"
date = 2026-06-20
description = "Why picking a sub-60-character <title> for vss.dev took me longer than building half the site."
authors = ["Victor Santos"]
[taxonomies]
tags = ["meta", "decisions"]
[extra]
filename = "choosing-the-page-title.md"
icon = "md"
+++

# Choosing the page title (and losing a morning to it)

I can talk to a computer all day. Tell it to refactor a module, wire up a build step, restructure my content folder, and it just happens. That part is easy now.

What is hard is deciding the small human things. Like the text that goes in the browser tab. I spent way too long on a single `<title>` tag, and I want to write down why, so next time I remember it was a real problem and not just me stalling.

## The constraint: under 60 characters

A page title should stay under ~60 characters. Past that, Google truncates it in search results, and it looks bad in a crowded tab bar. So everything below has to fit in that budget. That budget is the whole problem.

## I want `vss.dev` at the front

People keep a lot of tabs open. I do too. When you are hunting for a tab, you only see the first few characters of each title before it gets cut off. If mine starts with `vss.dev`, then even squeezed down to `vss.` it is still recognizable. That is a real, practical reason to put the domain first instead of my name.

The catch: `vss.dev` eats into the 60-character budget. Once I prefix it, the rest has to get shorter.

## What had to give

- I had to **drop the word "Portfolio"** in some options. With `vss.dev ·` in front, "Victor Santos", and "Portfolio, Projects & Knowledge Base", the title blows past 60 characters.
- I thought about **dropping my last name** so I could keep "Portfolio". But I was advised to keep the full name for SEO (people search "Victor Santos"), so the name stays and "Portfolio" is the thing that goes.

So it became a three-way fight between: the domain up front, my full name for SEO, and the keyword "Portfolio". Pick two. You cannot have all three under 60 characters.

## The options I narrowed down to

After way too much back and forth with Gemini, Copilot, ChatGPT and Claude, these were my favorites:

1. `vss.dev · Victor Santos' Projects & Knowledge Base`  ← **chosen**
2. `vss.dev · Victor's Portfolio, Projects & Knowledge Base`
3. `Victor Santos | Portfolio, Projects & Knowledge Base`
4. `Victor Santos | Portfolio, Projects & Technical Notes`
5. `vss.dev | Public Workspace & Tech Notebook`
6. `vss.dev | Victor Santos’s Public Workspace`
7. `vss.dev | Victor Santos's Code, Projects & Notes`
8. `Victor Santos | Developer Portfolio & Knowledge Base`

## What I picked, and why

I went with **option 1**: `vss.dev · Victor Santos' Projects & Knowledge Base`.

- `vss.dev` is first, so the tab stays findable even when truncated.
- Full name is in there for SEO.
- It fits under 60 characters.
- "Projects & Knowledge Base" describes what the site actually is better than "Portfolio" does, so dropping "Portfolio" stopped feeling like a loss.

## Note to self

This is the kind of decision that feels tiny and steals a whole morning. The problem was never writing the title. It was that three things I wanted could not all coexist in 60 characters, and I had to decide which one to give up. Keeping the rejected options here so I can revisit if I ever change my mind.
