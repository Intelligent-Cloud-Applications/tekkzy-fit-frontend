from pathlib import Path

from PIL import Image, ImageDraw

root = Path(r"f:\fitnessworld\tekkzyfit-app\android\app\src\main\res")


def draw_glyph(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 24.0

    def box(x, y, w, h, r=0.35):
        rad = max(1, int(r * s))
        d.rounded_rectangle(
            [x * s, y * s, (x + w) * s, (y + h) * s],
            radius=rad,
            fill=(255, 255, 255, 255),
        )

    # left plates
    box(2.2, 7.0, 2.0, 10.0, 0.45)
    box(4.3, 8.4, 1.6, 7.2, 0.35)
    # T top + stem + point
    box(8.0, 5.6, 8.0, 2.5, 0.4)
    box(10.7, 7.6, 2.6, 8.4, 0.2)
    cx, cy = 12 * s, 18.6 * s
    d.polygon(
        [
            (10.55 * s, 15.6 * s),
            (13.45 * s, 15.6 * s),
            (cx, cy),
        ],
        fill=(255, 255, 255, 255),
    )
    # right plates
    box(18.1, 8.4, 1.6, 7.2, 0.35)
    box(19.8, 7.0, 2.0, 10.0, 0.45)
    return img


for dens, size in {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}.items():
    folder = root / f"drawable-{dens}"
    folder.mkdir(exist_ok=True)
    draw_glyph(size).save(folder / "ic_stat_desk.png")
    print("wrote", folder / "ic_stat_desk.png")
