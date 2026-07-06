#!/usr/bin/env python3
"""Generate the vss.dev icon set.

The wordmark is "vss" (JetBrains Mono ExtraBold, white) over ".dev"
(JetBrains Mono Medium, accent orange), sized so both lines have exactly
the same ink width. Text is outlined into SVG paths so nothing depends on
fonts being installed where the icons are viewed.

Outputs
  static/img/favicon.svg              rounded tile, used as the browser favicon
  static/img/icon-192.png             PWA icon (purpose "any")
  static/img/icon-512.png             PWA icon (purpose "any")
  static/img/icon-maskable-192.png    PWA icon, wordmark inside the safe zone
  static/img/icon-maskable-512.png    PWA icon, wordmark inside the safe zone
  static/img/apple-touch-icon.png     180px, square corners (iOS masks it)
  assets/icons/*.svg                  standalone previews of every icon

Requirements: python3 + fontTools (pip install fonttools) and rsvg-convert
(apt install librsvg2-bin) for the PNGs. JetBrains Mono is downloaded into
assets/icons/fonts/ (gitignored) on first run.

The desktop-launcher line icons live in templates/macros.html (the `glyph`
macro); that copy is what the site serves. The path data here is a mirror
kept for standalone previews, so update both if a glyph changes.
"""

import io
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent          # assets/icons
REPO = HERE.parent.parent                       # repo root
IMG = REPO / "static" / "img"
FONTS = HERE / "fonts"

JBM_URL = "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
JBM_FILES = ["JetBrainsMono-ExtraBold.ttf", "JetBrainsMono-Medium.ttf"]

BG = "#17161c"        # site window background
WHITE = "#e9e6df"     # site --text (dark theme)
ORANGE = "#ff8a4c"    # site --accent (dark theme)

CANVAS = 512
WORD_WIDTH = 320      # ink width of both wordmark lines, in canvas units
GAP = 46              # vertical gap between the two lines' ink
MASK_SAFE = 0.72      # maskable icons: content scaled into the central zone


def fetch_fonts():
    if all((FONTS / f).exists() for f in JBM_FILES):
        return
    print(f"downloading JetBrains Mono into {FONTS} ...")
    FONTS.mkdir(parents=True, exist_ok=True)
    data = urllib.request.urlopen(JBM_URL).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for f in JBM_FILES:
            (FONTS / f).write_bytes(z.read(f"fonts/ttf/{f}"))


def line_path(fontfile, text, font_size, tighten=None):
    """Outline `text` as one SVG path (y-down, baseline at y=0, start x=0).
    Returns (path_d, (xmin, ymin, xmax, ymax)) in output units.
    `tighten` maps a character index to font units removed from that
    character's advance (pulls the rest of the line left)."""
    font = TTFont(FONTS / fontfile)
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    s = font_size / font["head"].unitsPerEm
    parts, x = [], 0
    bb = [1e9, 1e9, -1e9, -1e9]
    for i, ch in enumerate(text):
        glyph = glyphset[cmap[ord(ch)]]
        pen = SVGPathPen(glyphset)
        glyph.draw(TransformPen(pen, Transform(s, 0, 0, -s, x * s, 0)))
        if pen.getCommands():
            parts.append(pen.getCommands())
            bp = BoundsPen(glyphset)
            glyph.draw(bp)
            xmin, ymin, xmax, ymax = bp.bounds
            bb = [min(bb[0], (xmin + x) * s), min(bb[1], -ymax * s),
                  max(bb[2], (xmax + x) * s), max(bb[3], -ymin * s)]
        x += glyph.width - (tighten or {}).get(i, 0)
    return " ".join(parts), bb


def ink_width(fontfile, text, tighten=None):
    _, bb = line_path(fontfile, text, 100, tighten)
    return (bb[2] - bb[0]) / 100  # ink width per unit of font size


DOT_GAP = 0.6  # dot-to-"d" ink gap, as a fraction of the "dev" letter gaps


def dot_tighten(fontfile):
    """Font units to trim from the "."'s monospace advance so the dot-to-"d"
    ink gap is DOT_GAP times the letter-to-letter gaps inside "dev"."""
    font = TTFont(FONTS / fontfile)
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()

    def bounds(ch):
        bp = BoundsPen(glyphset)
        glyphset[cmap[ord(ch)]].draw(bp)
        return bp.bounds

    adv = glyphset[cmap[ord(".")]].width
    dot_gap = adv - bounds(".")[2] + bounds("d")[0]
    letter_gap = adv - bounds("d")[2] + bounds("e")[0]
    return dot_gap - DOT_GAP * letter_gap


def build_wordmark():
    """The two wordmark lines as positioned <path> templates ({v} / {d} are
    the fill colors), block centered on the 512px canvas."""
    tight = {0: dot_tighten("JetBrainsMono-Medium.ttf")}
    fs_vss = WORD_WIDTH / ink_width("JetBrainsMono-ExtraBold.ttf", "vss")
    fs_dev = WORD_WIDTH / ink_width("JetBrainsMono-Medium.ttf", ".dev", tight)
    vss_d, vb = line_path("JetBrainsMono-ExtraBold.ttf", "vss", fs_vss)
    dev_d, db = line_path("JetBrainsMono-Medium.ttf", ".dev", fs_dev, tight)

    left = (CANVAS - WORD_WIDTH) / 2
    vh, dh = vb[3] - vb[1], db[3] - db[1]
    top = (CANVAS - (vh + GAP + dh)) / 2
    pos = [
        (vss_d, left - vb[0], top - vb[1], "{v}"),
        (dev_d, left - db[0], top + vh + GAP - db[1], "{d}"),
    ]
    return "\n".join(
        f'<path transform="translate({tx:.2f} {ty:.2f})" fill="{f}" d="{d}"/>'
        for d, tx, ty, f in pos
    )


def svg(body, rounded=False, bg=True, safe=1.0):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">']
    if bg:
        rx = f' rx="{round(CANVAS * 0.225)}"' if rounded else ""
        parts.append(f'<rect width="{CANVAS}" height="{CANVAS}"{rx} fill="{BG}"/>')
    if safe < 1:
        off = CANVAS * (1 - safe) / 2
        body = f'<g transform="translate({off:.1f} {off:.1f}) scale({safe})">\n{body}\n</g>'
    parts += [body, "</svg>\n"]
    return "\n".join(parts)


# Standalone copies of the desktop-launcher line icons (24px grid, same
# stroke style as the site chrome). Canonical copy: templates/macros.html.
LINE_ICONS = {
    "app-helloworld": '<path d="M19.5 7A2.5 2.5 0 0 0 17 4.5H7A2.5 2.5 0 0 0 4.5 7v6A2.5 2.5 0 0 0 7 15.5h1.2v4l4.3-4H17a2.5 2.5 0 0 0 2.5-2.5z"/><path d="M8.8 10.3c1.05-1.2 2.15-1.2 3.2 0s2.15 1.2 3.2 0"/>',
    "app-install": '<path d="M12 4.5V14"/><path d="M8.2 10.4l3.8 3.8 3.8-3.8"/><path d="M4.5 15.5v1.8a2.2 2.2 0 0 0 2.2 2.2h10.6a2.2 2.2 0 0 0 2.2-2.2v-1.8"/>',
    "app-tasklist": '<path d="M4.5 6l1.7 1.7 3.2-3.2"/><path d="M12.5 6.2h7"/><path d="M4.5 12.6l1.7 1.7 3.2-3.2"/><path d="M12.5 12.8h7"/><path d="M6 19.4h.01"/><path d="M12.5 19.4h7"/>',
    "app-generic": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/>',
}


def line_icon_svg(body):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" '
        f'fill="none" stroke="{ORANGE}" stroke-width="1.6" stroke-linecap="round" '
        f'stroke-linejoin="round">{body}</svg>\n'
    )


def png(src, dest, size):
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(dest), str(src)],
        check=True,
    )
    print(f"  {dest.relative_to(REPO)} ({size}px)")


def main():
    fetch_fonts()
    mark = build_wordmark()
    two_tone = mark.replace("{v}", WHITE).replace("{d}", ORANGE)
    accent = mark.replace("{v}", ORANGE).replace("{d}", ORANGE)

    favicon = svg(two_tone, rounded=True)
    maskable = svg(two_tone, safe=MASK_SAFE)
    apple = svg(two_tone)  # square corners; iOS applies its own mask
    glyph = svg(accent, bg=False)  # the desk-tile wordmark, transparent bg

    (IMG / "favicon.svg").write_text(favicon)
    (HERE / "vssdev.svg").write_text(favicon)
    (HERE / "vssdev-maskable.svg").write_text(maskable)
    (HERE / "vssdev-glyph.svg").write_text(glyph)
    for name, body in LINE_ICONS.items():
        (HERE / f"{name}.svg").write_text(line_icon_svg(body))
    print(f"  {(IMG / 'favicon.svg').relative_to(REPO)} + previews in {HERE.relative_to(REPO)}/")

    if not shutil.which("rsvg-convert"):
        sys.exit("rsvg-convert not found (apt install librsvg2-bin); PNGs not generated")
    png(IMG / "favicon.svg", IMG / "icon-192.png", 192)
    png(IMG / "favicon.svg", IMG / "icon-512.png", 512)
    png(HERE / "vssdev-maskable.svg", IMG / "icon-maskable-192.png", 192)
    png(HERE / "vssdev-maskable.svg", IMG / "icon-maskable-512.png", 512)
    apple_tmp = HERE / ".apple-touch.svg"
    apple_tmp.write_text(apple)
    png(apple_tmp, IMG / "apple-touch-icon.png", 180)
    apple_tmp.unlink()


if __name__ == "__main__":
    main()
