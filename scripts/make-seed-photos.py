"""RCC-HIROS — seed placeholder 2x2 photos (session-34).

Generates one brown initials-tile PNG per active employee into
uploads/employees/photos/<employee-uuid>/seed-2x2.png.
Read-only against the database (only SELECTs); writes image files only.
"""
import os
import sys

import mysql.connector
from PIL import Image, ImageDraw, ImageFont

DB = {"host": "localhost", "user": "root", "password": "", "database": "rcc_hiros"}
SIZE = 400  # 2x2 at ~200dpi scale; served as-is, CSS sizes the box
BG = (107, 74, 48)      # rcc-primary #6B4A30
FG = (254, 249, 195)    # rcc-primary-foreground #FEF9C3
ACCENT = (212, 160, 23)  # rcc-accent #D4A017

ROOT = os.path.join(os.getcwd(), "uploads", "employees", "photos")


def initials(first: str, last: str) -> str:
    return ((first or "?")[:1] + (last or "?")[:1]).upper()


def main() -> int:
    conn = mysql.connector.connect(**DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, employeeId, firstName, lastName, photo FROM Employee "
        "WHERE active = 1 ORDER BY employeeId"
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    made, skipped = 0, 0
    try:
        font = ImageFont.truetype("arial.ttf", 150)
    except OSError:
        font = ImageFont.load_default()
    for emp_id, code, first, last, photo in rows:
        if photo:
            skipped += 1
            continue
        outdir = os.path.join(ROOT, emp_id)
        os.makedirs(outdir, exist_ok=True)
        out = os.path.join(outdir, "seed-2x2.png")
        img = Image.new("RGB", (SIZE, SIZE), BG)
        d = ImageDraw.Draw(img)
        d.rectangle([8, 8, SIZE - 8, SIZE - 8], outline=ACCENT, width=6)
        text = initials(first, last)
        bbox = d.textbbox((0, 0), text, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1]), text, font=font, fill=FG)
        img.save(out, "PNG")
        made += 1
        print(f"{code}: wrote {out}")
    print(f"[make-seed-photos] done: made={made} skipped={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
