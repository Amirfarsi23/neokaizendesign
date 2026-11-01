#!/usr/bin/env python3
"""
Resize and recompress JPGs that have no raw source to redo from scratch
(camera-only project photos, Blender/Twinmotion renders in assets/img/scroll).
convert.py handles everything with a .tif original; this is for the rest.

    python optimize-jpgs.py <file-or-dir> [<file-or-dir> ...]

Writes a .webp alongside each .jpg and overwrites the .jpg in place.
"""

import sys
from pathlib import Path
from PIL import Image

MAX_W = 1800
QUALITY = 82


def jpgs_in(path):
    p = Path(path)
    if p.is_file():
        return [p] if p.suffix.lower() in {".jpg", ".jpeg"} else []
    return sorted(f for f in p.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg"})


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python optimize-jpgs.py <file-or-dir> [...]")

    for arg in sys.argv[1:]:
        for jpg in jpgs_in(arg):
            im = Image.open(jpg).convert("RGB")
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            im.save(jpg, quality=QUALITY, optimize=True)
            im.save(jpg.with_suffix(".webp"), quality=QUALITY, method=6)
            print("ok:", jpg, im.size)


if __name__ == "__main__":
    main()
