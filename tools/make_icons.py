#!/usr/bin/env python3
"""Generates the Skystream logo and all icon assets deterministically."""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

SS = 4  # supersample factor

def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

BLUE   = (0x3D, 0x50, 0xFA)   # #3D50FA (CloudStream-style accent)
VIOLET = (0x8B, 0x5C, 0xF6)   # #8B5CF6
BG_TOP = (0x06, 0x07, 0x14)
BG_BOT = (0x14, 0x17, 0x33)

def gradient(size, c1, c2, horizontal=False):
    w, h = size
    g = Image.new("RGB", size)
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x / (w - 1)) if horizontal else (y / (h - 1))
            # diagonal blend
            t = (t + (x / (w - 1) if not horizontal else y / (h - 1))) / 2 if False else t
            px[x, y] = lerp(c1, c2, t)
    return g

def diagonal_gradient(size, c1, c2):
    w, h = size
    g = Image.new("RGB", size)
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w - 1 + h - 1)
            px[x, y] = lerp(c1, c2, t)
    return g

def cloud_mask(size):
    w, h = size
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    u = min(w, h) / 1000.0
    # unit coordinates (x, y, r) circles + rounded rect forming the cloud
    circles = [(385, 470, 132), (648, 462, 141), (515, 372, 158)]
    for cx, cy, r in circles:
        d.ellipse([(cx - r) * u, (cy - r) * u, (cx + r) * u, (cy + r) * u], fill=255)
    # base rounded rectangle
    x0, y0, x1, y1, r = 228, 415, 806, 668, 128
    d.rounded_rectangle([x0 * u, y0 * u, x1 * u, y1 * u], radius=r * u, fill=255)
    return m

def play_triangle(size, color=(255, 255, 255, 255)):
    w, h = size
    u = min(w, h) / 1000.0
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    pts = [(432, 408), (432, 592), (635, 500)]
    d.polygon([(x * u, y * u) for x, y in pts], fill=255)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    img.paste(color, (0, 0), m)
    return img

def render_mark(size, with_bg=True, bg_rounded=True, mark_scale=0.78):
    """Render the full Skystream mark. size = final px."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if with_bg:
        bg = diagonal_gradient((S, S), BG_TOP, BG_BOT).convert("RGBA")
        if bg_rounded:
            mask = Image.new("L", (S, S), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=0.225 * S, fill=255)
            canvas.paste(bg, (0, 0), mask)
        else:
            canvas.paste(bg, (0, 0))
    # mark layer
    mark_S = int(S * mark_scale)
    grad = diagonal_gradient((mark_S, mark_S), BLUE, VIOLET).convert("RGBA")
    m = cloud_mask((mark_S, mark_S))
    # subtle top light on the cloud
    light = Image.new("L", (mark_S, mark_S), 0)
    ld = ImageDraw.Draw(light)
    for y in range(mark_S):
        alpha = int(46 * max(0.0, 1.0 - y / (mark_S * 0.55)))
        ld.line([(0, y), (mark_S, y)], fill=alpha)
    grad.paste((255, 255, 255, 255), (0, 0), light.point(lambda v: v // 3))
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    mark.paste(grad, (0, 0), m)
    mark = Image.alpha_composite(mark, play_triangle((mark_S, mark_S), (255, 255, 255, 242)))
    offset = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, offset)
    return canvas.resize((size, size), Image.LANCZOS)

def rounded_icon(size):
    return render_mark(size, with_bg=True, bg_rounded=True)

def flat_icon(size):
    return render_mark(size, with_bg=True, bg_rounded=False)

def foreground(size):
    """Adaptive icon foreground: cloud only, transparent, safe-zone padded."""
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mark_S = int(S * 0.62)
    grad = diagonal_gradient((mark_S, mark_S), BLUE, VIOLET).convert("RGBA")
    m = cloud_mask((mark_S, mark_S))
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    mark.paste(grad, (0, 0), m)
    mark = Image.alpha_composite(mark, play_triangle((mark_S, mark_S), (255, 255, 255, 242)))
    off = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, off)
    return canvas.resize((size, size), Image.LANCZOS)

def monochrome(size):
    S = size * SS
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mark_S = int(S * 0.62)
    m = cloud_mask((mark_S, mark_S))
    white = Image.new("RGBA", (mark_S, mark_S), (255, 255, 255, 255))
    mark = Image.new("RGBA", (mark_S, mark_S), (0, 0, 0, 0))
    mark.paste(white, (0, 0), m)
    mark = Image.alpha_composite(mark, play_triangle((mark_S, mark_S), (0, 0, 0, 255)))
    off = ((S - mark_S) // 2, (S - mark_S) // 2)
    canvas.alpha_composite(mark, off)
    return canvas.resize((size, size), Image.LANCZOS)

def banner(w, h, wordmark=True):
    S = 4
    W, H = w * S, h * S
    canvas = diagonal_gradient((W, H), BG_TOP, BG_BOT).convert("RGBA")
    mark = render_mark(int(H * 0.78), with_bg=False, bg_rounded=False)
    mx = int(W * 0.06)
    my = (H - mark.height) // 2
    canvas.alpha_composite(mark, (mx, my))
    if wordmark:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(H * 0.28))
        except Exception:
            font = ImageFont.load_default()
        d = ImageDraw.Draw(canvas)
        tx = mx + mark.width + int(W * 0.05)
        ty = (H - int(H * 0.28)) // 2 - int(H * 0.02)
        d.text((tx, ty), "Skystream", font=font, fill=(245, 246, 255, 255))
    return canvas.resize((w, h), Image.LANCZOS)

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    A = os.path.join(root, "android", "app", "src", "main", "res")
    # --- Android legacy mipmaps
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dens, px in densities.items():
        d = os.path.join(A, f"mipmap-{dens}")
        os.makedirs(d, exist_ok=True)
        rounded_icon(px).save(os.path.join(d, "ic_launcher.png"))
        rounded_icon(px).save(os.path.join(d, "ic_launcher_round.png"))
    # banner for TV (xhdpi folder)
    banner(320, 180, wordmark=True).save(os.path.join(A, "mipmap-xhdpi", "ic_banner.png"))
    # adaptive icon drawables (432px png in drawable-xxxhdpi)
    fg_dir = os.path.join(A, "drawable-xxxhdpi")
    os.makedirs(fg_dir, exist_ok=True)
    foreground(432).save(os.path.join(fg_dir, "ic_launcher_foreground_sky.png"))
    monochrome(432).save(os.path.join(fg_dir, "ic_launcher_monochrome_sky.png"))
    # --- desktop + docs assets
    os.makedirs(os.path.join(root, "desktop", "build"), exist_ok=True)
    flat_icon(1024).save(os.path.join(root, "desktop", "build", "icon.png"))
    rounded_icon(512).save(os.path.join(root, "docs", "icon.png"))
    banner(1280, 400, wordmark=True).save(os.path.join(root, "docs", "banner.png"))
    try:
        flat_icon(1024).save(os.path.join(root, "desktop", "build", "icon.icns"))
        print("icns written")
    except Exception as e:
        print("icns skipped:", e)
    print("icons done")

if __name__ == "__main__":
    main()
