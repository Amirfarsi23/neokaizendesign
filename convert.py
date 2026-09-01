from pathlib import Path
from PIL import Image

root = Path("images/Projects")
MAX_W = 2400

for tif in sorted(root.rglob("*")):
    if tif.suffix.lower() not in {".tif", ".tiff"}:
        continue
    im = Image.open(tif).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    out = tif.with_suffix(".jpg")
    im.save(out, quality=90, optimize=True)
    print("ok:", tif.name, "->", out.name, im.size)