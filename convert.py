from pathlib import Path
from PIL import Image

root = Path("images/Projects")
# 1800px covers a 2x-retina display of the ~900px-wide slot these photos are
# ever shown in; quality 82 is visually indistinguishable from 90 for photos
# but noticeably smaller.
MAX_W = 1800
QUALITY = 82

for tif in sorted(root.rglob("*")):
    if tif.suffix.lower() not in {".tif", ".tiff"}:
        continue
    im = Image.open(tif).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    jpg = tif.with_suffix(".jpg")
    im.save(jpg, quality=QUALITY, optimize=True)
    webp = tif.with_suffix(".webp")
    im.save(webp, quality=QUALITY, method=6)
    print("ok:", tif.name, "->", jpg.name, "+", webp.name, im.size)