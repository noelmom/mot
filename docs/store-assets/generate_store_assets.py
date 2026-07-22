from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
BG_PATH = Path(__file__).with_name("premium-background.png")
LOGO_PATH = ROOT / "assets" / "icon-master.png"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

SOURCES = {
    "restore": Path(__file__).with_name("source-restore.png"),
    "controls": Path(__file__).with_name("source-controls.png"),
    "results": Path(__file__).with_name("source-results.png"),
    "clear": Path(__file__).with_name("source-clear.png"),
    "popup": Path(__file__).with_name("source-popup.png"),
}

CROPS = {
    "restore": (34, 28, 914, 1059),
    "controls": (19, 24, 900, 1055),
    "results": (14, 20, 895, 998),
    "clear": (18, 16, 899, 761),
    "popup": (16, 0, 676, 838),
}

WHITE = "#f8fafc"
MUTED = "#a8b4c7"
VIOLET = "#a855f7"
GREEN = "#4ade80"
PANEL = "#0b1423"
BORDER = "#26344d"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def cover_background(size):
    source = Image.open(BG_PATH).convert("RGB")
    sw, sh = source.size
    scale = max(size[0] / sw, size[1] / sh)
    resized = source.resize((round(sw * scale), round(sh * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    canvas = resized.crop((left, top, left + size[0], top + size[1]))
    veil = Image.new("RGB", size, "#07101f")
    return Image.blend(canvas, veil, 0.22)


def draw_brand(canvas, x=56, y=42, compact=False):
    logo_size = 42 if compact else 48
    logo = Image.open(LOGO_PATH).convert("RGBA")
    logo.thumbnail((logo_size, logo_size), Image.Resampling.LANCZOS)
    canvas.paste(logo, (x, y), logo)
    draw = ImageDraw.Draw(canvas)
    draw.text((x + logo_size + 12, y + 3), "Rebound", font=font(22 if compact else 24, True), fill=WHITE)
    if not compact:
        draw.text((x + logo_size + 13, y + 31), "FOR OKTA ADMINS", font=font(10, True), fill="#9982c8", spacing=2)


def draw_pill(draw, xy, text, accent=VIOLET):
    x, y = xy
    f = font(13, True)
    box = draw.textbbox((0, 0), text, font=f)
    width = box[2] + 28
    draw.rounded_rectangle((x, y, x + width, y + 32), radius=16, fill="#121d31", outline="#32415d", width=1)
    draw.ellipse((x + 12, y + 13, x + 18, y + 19), fill=accent)
    draw.text((x + 24, y + 8), text, font=f, fill="#dbe5f4")
    return x + width


def draw_copy(canvas, eyebrow, headline, body, pills):
    draw = ImageDraw.Draw(canvas)
    x = 56
    draw.text((x, 145), eyebrow.upper(), font=font(12, True), fill="#a78bfa")
    y = 182
    for line in headline:
        draw.text((x, y), line, font=font(48, True), fill=WHITE)
        y += 55
    y += 18
    for line in body:
        draw.text((x, y), line, font=font(19), fill=MUTED)
        y += 30
    px = x
    py = 680
    for pill, accent in pills:
        px = draw_pill(draw, (px, py), pill, accent) + 10


def product_capture(key):
    return Image.open(SOURCES[key]).convert("RGB").crop(CROPS[key])


def paste_product(canvas, key, box, align="center"):
    product = product_capture(key)
    max_w, max_h = box[2] - box[0], box[3] - box[1]
    scale = min(max_w / product.width, max_h / product.height)
    product = product.resize((round(product.width * scale), round(product.height * scale)), Image.Resampling.LANCZOS)
    x = box[0] + (max_w - product.width) // 2
    y = box[1] + ((max_h - product.height) // 2 if align == "center" else 0)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x - 7, y - 7, x + product.width + 7, y + product.height + 7), radius=28, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas.paste(shadow, (0, 0), shadow)

    border = Image.new("RGBA", (product.width + 4, product.height + 4), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle((0, 0, border.width - 1, border.height - 1), radius=22, fill=BORDER)
    canvas.paste(border, (x - 2, y - 2), border)
    product_mask = Image.new("L", product.size, 0)
    ImageDraw.Draw(product_mask).rounded_rectangle(
        (0, 0, product.width - 1, product.height - 1), radius=18, fill=255
    )
    canvas.paste(product, (x, y), product_mask)


def add_frame_details(canvas):
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((20, 20, canvas.width - 21, canvas.height - 21), radius=28, outline="#26344d", width=1)
    draw.line((56, 112, canvas.width - 56, 112), fill="#1d2b42", width=1)


def save_rgb(image, path):
    image.convert("RGB").save(path, "PNG", optimize=True)


def screenshot(key, filename, eyebrow, headline, body, pills, product_box):
    canvas = cover_background((1280, 800))
    add_frame_details(canvas)
    draw_brand(canvas)
    draw_copy(canvas, eyebrow, headline, body, pills)
    paste_product(canvas, key, product_box)
    save_rgb(canvas, DOCS / filename)


def generate_screenshots():
    screenshot(
        "results", "Rebound-screenshot-1-find-review-1280x800.png", "Live suppression intelligence",
        ["Find every", "suppressed address."],
        ["Search bounce and deferred events.", "Filter by state. Act with confidence."],
        [("Okta connected", GREEN), ("CSV export", VIOLET)], (625, 54, 1232, 756),
    )
    screenshot(
        "restore", "Rebound-screenshot-2-restore-delivery-1280x800.png", "Recovery with proof",
        ["Restore delivery.", "Keep the audit trail."],
        ["Clear suppressions in seconds—with", "a timestamped CSV for every attempt."],
        [("Per-address status", GREEN), ("Audit ready", VIOLET)], (660, 44, 1218, 765),
    )
    screenshot(
        "controls", "Rebound-screenshot-3-features-1280x800.png", "Built for daily operations",
        ["Powerful controls.", "Zero clutter."],
        ["Debug when you need it. Stay focused", "when you don't. Everything runs locally."],
        [("Private by design", GREEN), ("No API tokens", VIOLET)], (660, 48, 1220, 760),
    )
    screenshot(
        "clear", "Rebound-screenshot-4-all-clear-1280x800.png", "Fast, quiet confirmation",
        ["Know when you're", "all clear."],
        ["One glance confirms the selected window", "has no bounced or deferred addresses."],
        [("Last checked", GREEN), ("Re-run anytime", VIOLET)], (594, 126, 1232, 696),
    )
    screenshot(
        "popup", "Rebound-screenshot-5-toolbar-control-1280x800.png", "Always within reach",
        ["Control Rebound", "from the toolbar."],
        ["Enable the panel per tab and keep", "essential actions one click away."],
        [("Per-tab control", GREEN), ("Local processing", VIOLET)], (734, 34, 1184, 766),
    )


def generate_small_tile():
    canvas = cover_background((440, 280))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, 439, 279), radius=22, outline="#303d59", width=2)
    draw_brand(canvas, 28, 25, compact=True)
    draw.text((28, 96), "Built for", font=font(28, True), fill="#d8b4fe")
    draw.text((28, 128), "Okta admins.", font=font(42, True), fill=WHITE)
    draw.rounded_rectangle((28, 217, 282, 250), radius=16, fill="#161d34", outline="#4c3478", width=1)
    draw.ellipse((43, 230, 51, 238), fill=GREEN)
    draw.text((60, 225), "Restore bounced email delivery", font=font(13, True), fill="#d7e0ee")
    save_rgb(canvas, DOCS / "Rebound-small-tile-440x280.png")


def generate_marquee():
    canvas = cover_background((1400, 560))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, 1399, 559), radius=26, outline="#303d59", width=2)
    draw_brand(canvas, 56, 42)
    draw.text((56, 158), "Restore delivery.", font=font(54, True), fill=WHITE)
    draw.text((56, 218), "Keep Okta clean.", font=font(54, True), fill=WHITE)
    draw.text((56, 303), "Find, review, and clear bounced or deferred", font=font(20), fill=MUTED)
    draw.text((56, 333), "email suppressions—without leaving the admin console.", font=font(20), fill=MUTED)
    draw_pill(draw, (56, 405), "Private by design", GREEN)
    draw_pill(draw, (224, 405), "Audit-ready CSV", VIOLET)
    paste_product(canvas, "results", (780, 25, 1338, 540))
    save_rgb(canvas, DOCS / "Rebound-marquee-1400x560.png")


if __name__ == "__main__":
    generate_screenshots()
    generate_small_tile()
    generate_marquee()
