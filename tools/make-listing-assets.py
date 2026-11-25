"""Generate store assets: logo-512.png and cover-1200x630.png.

Run: .venv/Scripts/python.exe tools/make-listing-assets.py
Source logo: bundle/logo.png (1254x1254 RGB).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "bundle" / "logo.png"
OUT = ROOT / "docs" / "listing"
OUT.mkdir(parents=True, exist_ok=True)

INK = (43, 39, 36)
MUTED = (110, 106, 100)
BG = (245, 242, 237)
ACCENT = (124, 147, 166)
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"


def logo(size: int) -> Image.Image:
    image = Image.open(SRC).convert("RGB")
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    square = image.crop((left, top, left + side, top + side))
    return square.resize((size, size), Image.LANCZOS)


def main() -> None:
    logo(512).save(OUT / "logo-512.png", optimize=True)

    canvas = Image.new("RGB", (1200, 630), BG)
    draw = ImageDraw.Draw(canvas)

    mark = logo(240)
    canvas.paste(mark, (96, 195))

    x = 400
    draw.text((x, 208), "scholarOS", font=ImageFont.truetype(FONT_BOLD, 92), fill=INK)
    draw.rectangle([x + 2, 330, x + 66, 334], fill=ACCENT)

    say = ImageFont.truetype(FONT_REG, 31)
    draw.text((x, 366), "Read, extract, cite, and ship", font=say, fill=MUTED)
    draw.text((x, 410), "your manuscripts.", font=say, fill=MUTED)

    small = ImageFont.truetype(FONT_REG, 22)
    draw.text((96, 540), "A research workbench for Anna", font=small, fill=MUTED)

    canvas.save(OUT / "cover-1200x630.png", optimize=True)
    print("wrote", OUT / "logo-512.png", logo(512).size)
    print("wrote", OUT / "cover-1200x630.png", canvas.size)


if __name__ == "__main__":
    main()
