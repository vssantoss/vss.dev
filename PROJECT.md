# vss.dev

My personal site, a developer's workspace you browse like a code editor.
Posts, tips, a Now page, and a **Career Changelog**.

Built with [Zola](https://www.getzola.org) (static site generator). No
front-end framework: the editor UI is hand-written HTML/CSS/JS, and every
page is pre-rendered to static HTML so it's fully indexable by search
engines.

## Structure

| Path | What it is | Edit by hand? |
|------|-----------|---------------|
| `content/` | **Source of truth**: markdown with `+++` TOML front matter | ✅ yes |
| `templates/` | Zola/Tera templates = the editor chrome | ✅ yes |
| `static/` | `editor.css`, `editor.js`, images, `robots.txt` | ✅ yes |
| `config.toml` | site config (base_url, feeds, etc.) | ✅ yes |
| `public/` | **Generated** by `zola build`, the deployable site (git-ignored, deployed out-of-band) | ❌ no (not committed) |
| `design-refs/` | Five alternate design explorations and a gallery (**reference only**) | ❌ no (ignored by Zola) |

### Adding content
- **A post:** drop a `.md` in `content/posts/` (copy an existing one's front matter), then build.
- **A tip:** same, in `content/tips/`.
- **A page** (like `now`/`contact`): a `.md` in `content/` with `path = "slug"` and an `[extra] order` for tree position.

Each file's `[extra].filename` is what shows in the editor's file tree.

## Develop

```sh
zola serve      # live-reload dev server at http://127.0.0.1:1111
zola build      # writes the static site to ./public
zola check      # validate links & content
```

## Deploy

Static host of choice. Build locally and publish the contents of `public/`.

## SEO

Pre-rendered HTML per page, per-page `<title>`/description, canonical +
Open Graph + JSON-LD, plus Zola's automatic `sitemap.xml` and `rss.xml`.

## TODO
- Build the contact form (email is intentionally kept off the site to avoid scrapers)
- Fill remaining bracketed `[…]` placeholders in `content/*.md` (Career Changelog specifics, `now.md` date, book refs)
