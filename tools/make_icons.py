#!/usr/bin/env python3
"""Generates the Skystream mark and every icon asset deterministically.

Design: "Skystream Première" — a faceted paper plane rendered in champagne
gold on a warm-graphite badge (see docs/FEATURES.md). Replaces the old
navy/cyan cloud logo and the navy paper-plane iteration.

Run from anywhere:  python3 tools/make_icons.py
Requires: Pillow (pip install pillow)

Plane geometry lives in the Android vector drawables too
(drawable/ic_launcher_foreground_sky is a raster; the small-icon and
wordmark vectors carry the same pathData):

  outer facet  M8,44 L93,10 L57,88 L42,55 Z
  right facet  M42,55 L93,10 L57,88 Z
  kite facet   M42,55 L55,66 L49,78 Z
"""
import os
import struct
from PIL import Image, ImageDraw, ImageFont

SS = 4  # supersample factor

# ── palette (Première) ──────────────────────────────────────────────
WING   = (0xEF, 0xCE, 0x8B)   # champagne light — left facet
BODY   = (0xC7, 0x9A, 0x4B)   # antique gold   — right facet
KITE   = (0xFF, 0xF6, 0xDC)   # highlight      — kite facet
BG_TOP = (0x26, 0x20, 0x1A)   # badge gradient start (warm umber)
BG_BOT = (0x14, 0x11, 0x10)   # badge gradient end   (graphite)
GOLD   = (0xE0, 0xB1, 0x5C)   # accent
INK    = (0xED, 0xE3, 0xD0)   # cream text


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diagonal_gradient(size, c1, c2):
    w, h = size
    g = Image.new("RGB", size)
    px = g.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = lerp(c1, c2, (x + y) / (w - 1 + h - 1))
    return g


def radial_glow(size, center, radius, color, peak_alpha=90):
    """Soft radial glow layer (RGBA) centered at `center`."""
    w, h = size
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    px = glow.load()
    cx, cy = center
    r2 = radius * radius
    for y in range(h):
        dy = y - cy
        for x in range(w):
            d2 = (x - cx) ** 2 + dy * dy
            if d2 < r2:
                t = 1.0 - (d2 ** 0.5) / radius
                px[x, y] = (color[0], color[1], color[2], int(peak_alpha * (t ** 2)))
    return glow


def rounded_mask(size, radius_ratio=0.225):
    w, h = size
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius_ratio * min(w, h), fill=255)
    return m


def plane_mask(size):
    """Alpha mask of the three facets, unified silhouette."""
    w, h = size
    u = min(w, h) / 1000.0
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    outer = [(80, 440), (930, 100), (570, 880), (420, 550)]
    d.polygon([(x * u, y * u) for x, y in outer], fill=255)
    return m


def facet_images(size):
    """Render the three gold facets as separate RGBA layers."""
    w, h = size
    u = min(w, h) / 1000.0
    wing = Image.new("RGBA", size, (0, 0, 0, 0))
    body = Image.new("RGBA", size, (0, 0, 0, 0))
    kite = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(wing).polygon([(x * u, y * u) for x, y in [(80, 440), (930, 100), (570, 880), (420, 550)]],
                                 fill=WING + (255,))
    ImageDraw.Draw(body).polygon([(x * u, y * u) for x, y in [(420, 550), (930, 100), (570, 880)]],
                                 fill=BODY + (255,))
    ImageDraw.Draw(kite).polygon([(x * u, y * u) for x, y in [(420, 550), (550, 660), (490, 780)]],
                                 fill=KITE + (255,))
    return wing, body, kite


def render_mark(size, with_bg=True, bg_rounded=True, mark_scale=0.80):
    """Full Skystream Première mark. size = final px."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_bg:
        bg = diagonal_gradient((S, S), BG_TOP, BG_BOT).convert("RGBA")
        bg = Image.alpha_composite(bg, radial_glow((S, S), (S * 0.86, S * 0.10), S * 0.75, GOLD, 64))
        if bg_rounded:
            canvas.paste(bg, (0, 0), rounded_mask((S, S)))
        else:
            canvas.paste(bg, (0, 0))
    mark_S = int(S * mark_scale)
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    for layer in facet_images((mark_S, mark_S)):
        mark = Image.alpha_composite(mark, layer)
    offset = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, offset)
    return canvas.resize((size, size), Image.LANCZOS)


def rounded_icon(size):
    return render_mark(size, with_bg=True, bg_rounded=True)


def flat_icon(size):
    return render_mark(size, with_bg=True, bg_rounded=False)


def foreground(size):
    """Adaptive-icon foreground: facets only, transparent, safe-zone padded."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mark_S = int(S * 0.62)
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    for layer in facet_images((mark_S, mark_S)):
        mark = Image.alpha_composite(mark, layer)
    off = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, off)
    return canvas.resize((size, size), Image.LANCZOS)


def monochrome(size):
    """Single-color white silhouette (notifications / themed icons)."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mark_S = int(S * 0.62)
    u = mark_S / 1000.0
    m = Image.new("L", (mark_S, mark_S), 0)
    d = ImageDraw.Draw(m)
    # silhouette = union of the three facets
    for pts in ([(80, 440), (930, 100), (570, 880), (420, 550)],
                [(420, 550), (550, 660), (490, 780)]):
        d.polygon([(x * u, y * u) for x, y in pts], fill=255)
    white = Image.new("RGBA", (mark_S, mark_S), (255, 255, 255, 255))
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    mark.paste(white, (0, 0), m)
    off = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, off)
    return canvas.resize((size, size), Image.LANCZOS)


def banner(w, h, wordmark=True):
    S = 4
    W, H = w * S, h * S
    canvas = diagonal_gradient((W, H), (0x20, 0x1B, 0x15), (0x12, 0x10, 0x0E)).convert("RGBA")
    canvas = Image.alpha_composite(canvas, radial_glow((W, H), (W * 0.88, H * 0.02), W * 0.55, GOLD, 72))
    mark = render_mark(int(H * 0.74), with_bg=False)
    mx = int(W * 0.055)
    my = (H - mark.height) // 2
    canvas.alpha_composite(mark, (mx, my))
    if wordmark:
        font_size = int(H * 0.26)
        font = None
        for candidate in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                          "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
            try:
                font = ImageFont.truetype(candidate, font_size)
                break
            except Exception:
                continue
        if font is None:
            font = ImageFont.load_default()
        d = ImageDraw.Draw(canvas)
        tx = mx + mark.width + int(W * 0.045)
        ty = (H - font_size) // 2 - int(H * 0.02)
        d.text((tx, ty), "Skystream", font=font, fill=INK + (255,))
    return canvas.resize((w, h), Image.LANCZOS)


def write_icns(out_path):
    """Hand-roll a minimal .icns (PNG-compressed chunks) — Pillow can't write one."""
    sizes = {"ic07": 128, "ic08": 256, "ic09": 512, "ic10": 1024}
    chunks = []
    for ostype, px in sizes.items():
        img = flat_icon(px)
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        chunks.append(ostype.encode("ascii") + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(chunks)
    with open(out_path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    A = os.path.join(root, "android", "app", "src", "main", "res")
    # --- Android legacy + debug/prerelease mipmaps (identical mark)
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for src in ("main", "debug", "prerelease"):
        base = os.path.join(root, "android", "app", "src", src)
        res = os.path.join(base, "res") if src != "main" else A
        for dens, px in densities.items():
            d = os.path.join(res, f"mipmap-{dens}")
            os.makedirs(d, exist_ok=True)
            rounded_icon(px).save(os.path.join(d, "ic_launcher.png"))
            rounded_icon(px).save(os.path.join(d, "ic_launcher_round.png"))
        # Play store listing icon (512px, full-bleed)
        flat_icon(512).save(os.path.join(base, "ic_launcher-playstore.png"))
    # banner for TV (xhdpi folder) — main + debug + prerelease mirrors
    banner(320, 180).save(os.path.join(A, "mipmap-xhdpi", "ic_banner.png"))
    for src in ("debug", "prerelease"):
        d = os.path.join(root, "android", "app", "src", src, "res", "mipmap-xhdpi")
        if os.path.isdir(d):
            banner(320, 180).save(os.path.join(d, "ic_banner.png"))
    # adaptive-icon rasters (432px png in drawable-xxxhdpi)
    fg_dir = os.path.join(A, "drawable-xxxhdpi")
    os.makedirs(fg_dir, exist_ok=True)
    foreground(432).save(os.path.join(fg_dir, "ic_launcher_foreground_sky.png"))
    monochrome(432).save(os.path.join(fg_dir, "ic_launcher_monochrome_sky.png"))
    # --- desktop + docs + website
    os.makedirs(os.path.join(root, "desktop", "build"), exist_ok=True)
    flat_icon(1024).save(os.path.join(root, "desktop", "build", "icon.png"))
    rounded_icon(512).save(os.path.join(root, "desktop", "build", "master-512.png"))
    flat_1024 = Image.open(os.path.join(root, "desktop", "build", "icon.png"))
    flat_1024.save(os.path.join(root, "desktop", "build", "icon.ico"),
                   sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    write_icns(os.path.join(root, "desktop", "build", "icon.icns"))
    os.remove(os.path.join(root, "desktop", "build", "master-512.png"))
    rounded_icon(512).save(os.path.join(root, "docs", "icon.png"))
    banner(1280, 360).save(os.path.join(root, "docs", "banner.png"))
    rounded_icon(512).save(os.path.join(root, "website", "assets", "icon.png"))
    print("icons done")


if __name__ == "__main__":
    main()
