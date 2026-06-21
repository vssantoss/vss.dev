# Drafts

This is my **public notebook**.

The site ([vss.dev](https://vss.dev)) is built in public, so the source lives in
a public repo. This folder is where I keep work that is *visible in the repo* but
deliberately *never published to the live site*.

## What lives here

- **Drafts** — posts and notes that aren't ready (or may never be) to go online.
- **Ideas** — things I might write or build later.
- **Decisions** — when I have to choose between several options, I list all of
  them here, with the trade-offs, and pick one. I keep the rejected options
  around so I can revisit the decision later if needed.

Think of it as the "show your work" pile behind the polished pages.

## Why it's a Zola section with `draft = true`

`_index.md` in this folder sets `draft = true`. In Zola that flag cascades to
**everything** in the section, so none of these files are rendered, listed, or
added to feeds/sitemap during a normal build:

```bash
zola build      # drafts excluded (this is what deploys)
zola serve      # drafts excluded
```

To preview drafts rendered locally, opt in explicitly:

```bash
zola build --drafts
zola serve --drafts
```

## Important: "private" here means *unpublished*, not *secret*

These files **are visible to anyone reading the repo on GitHub.** The draft flag
only keeps them off the live website. Don't put anything genuinely sensitive
(credentials, private third-party info, etc.) in here.
