
#!/usr/bin/env python3
"""
NeoKaizen Design — static site builder.

    python build.py            build once
    python build.py --watch    rebuild automatically while you edit

Edit content in  data/*.json ,  layout in  templates/ ,  styling in assets/css.
Never edit index.html by hand — it is generated and will be overwritten.
"""

import json, re, sys, time, shutil
from datetime import date
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT      = Path(__file__).parent
DATA      = ROOT / "data"
TEMPLATES = ROOT / "templates"
IMG       = ROOT / "assets" / "img" / "projects"
IMG_ALT   = ROOT / "images" / "Projects"
VIDEOS    = ROOT / "data" / "videos"
OUT       = ROOT / "index.html"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}
# Formate, die ein Browser NICHT anzeigen kann — werden gemeldet
BAD_EXT   = {".tif", ".tiff", ".bmp", ".heic", ".heif", ".psd", ".raw",
             ".cr2", ".nef", ".arw", ".dng", ".svg"}


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


YOUTUBE_ID_RE = re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?v=|embed/|shorts/))([\w-]{11})")


def youtube_id(value):
    """Accepts a bare video ID or any common YouTube URL and returns the 11-char ID."""
    if not value:
        return ""
    m = YOUTUBE_ID_RE.search(value)
    if m:
        return m.group(1)
    return value if re.fullmatch(r"[\w-]{11}", value) else ""


TXT_KEY_RE = re.compile(r"^(Title|Type|Client|Year|Tags|YouTube)\s*:\s*(.*)$", re.IGNORECASE)


def parse_info_txt(path):
    """
    Reads a simple text file:
        Title of the thing            (or  Title: Title of the thing)

        Free-text description, one or more paragraphs.

    Optional header lines (any order, before the description) let you
    also set:  Type:  Client:  Year:  Tags: (comma-separated)  YouTube: (link or ID)
    Anything left out just stays empty — same as before.
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1

    meta = {}
    # a first line that isn't itself a "Key: value" line is a bare title
    if i < len(lines) and lines[i].strip() and not TXT_KEY_RE.match(lines[i]):
        meta["title"] = lines[i].strip()
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1

    while i < len(lines):
        m = TXT_KEY_RE.match(lines[i])
        if not m:
            break
        meta[m.group(1).lower()] = m.group(2).strip()
        i += 1

    while i < len(lines) and not lines[i].strip():
        i += 1

    body = "\n".join(lines[i:]).strip()
    paragraphs = [" ".join(p.split()) for p in re.split(r"\n\s*\n", body) if p.strip()]
    if paragraphs:
        meta["summary_paragraphs"] = paragraphs
        meta["summary"] = " ".join(paragraphs)
    if "tags" in meta:
        meta["tags"] = [t.strip() for t in meta["tags"].split(",") if t.strip()]
    return {k: v for k, v in meta.items() if v}


def prepare_projects(meta):
    """
    Projects come from folders. Two locations are scanned:
        images/Projects/<name>/          (your existing folders)
        assets/img/projects/<name>/
    data/projects.json only supplies titles and text, keyed by folder name.
    A folder with no entry still shows up, using sensible defaults.
    """
    by_slug = {m["slug"]: m for m in meta} if isinstance(meta, list) else meta

    folders = []
    if IMG_ALT.exists():
        def key(x):
            return (0, int(x.name)) if x.name.isdigit() else (1, x.name.lower())
        for d in sorted(IMG_ALT.iterdir(), key=key):
            if d.is_dir():
                folders.append((d, f"images/Projects/{d.name}/"))

    projects = []
    for folder, web in folders:
        files = [f for f in folder.iterdir() if f.is_file()]
        imgs  = sorted(f.name for f in files if f.suffix.lower() in IMAGE_EXT)
        bad   = sorted(f.name for f in files if f.suffix.lower() in BAD_EXT)
        other = sorted(f.name for f in files
                       if f.suffix.lower() not in IMAGE_EXT
                       and f.suffix.lower() not in BAD_EXT)
        subs  = sorted(d.name for d in folder.iterdir() if d.is_dir())

        if not imgs:
            reason = "keine Bilder"
            if bad:   reason = f"Format wird im Browser nicht angezeigt: {', '.join(bad[:3])}"
            elif subs:  reason = f"Bilder liegen in Unterordnern: {', '.join(subs[:3])}"
            elif other: reason = f"unbekannte Dateien: {', '.join(other[:3])}"
            print(f"  ! Ordner {folder.name:<4} übersprungen — {reason}")
            continue

        note = ""
        if bad:   note += f"  ({len(bad)} Datei(en) im falschen Format ignoriert)"
        if subs:  note += f"  (Unterordner ignoriert: {', '.join(subs[:2])})"
        print(f"  · Ordner {folder.name:<4} {len(imgs)} Bild(er){note}")

        m = dict(by_slug.get(folder.name, {}))
        info = folder / "info.txt"
        if info.exists():
            m.update(parse_info_txt(info))
        cover = m.get("cover") if m.get("cover") in imgs else imgs[0]

        listed = m.get("images")
        if listed:
            gallery = [i for i in listed if i["file"] in imgs]
        else:
            gallery = [{"file": n, "caption": ""} for n in imgs]

        projects.append({
            "slug":    folder.name,
            "title":   m.get("title",   folder.name),
            "client":  m.get("client",  ""),
            "year":    m.get("year",    ""),
            "type":    m.get("type",    ""),
            "summary_paragraphs": m.get("summary_paragraphs", []),
            "tags":    m.get("tags",    []),
            "dir":     web,
            "cover":   cover,
            "images":  gallery,
            "youtube_id": youtube_id(m.get("youtube", "")),
        })

    print(f"  → {len(projects)} Projekt(e) übernommen\n")
    return projects


def prepare_videos():
    """
    XR video showcase, independent of the projects above.
    Drop a text file into  data/videos/  — same format as a project's info.txt,
    but the important line is  YouTube: <link or ID> . No file, no section.
    """
    if not VIDEOS.exists():
        return []

    def key(x):
        stem = x.stem
        return (0, int(stem)) if stem.isdigit() else (1, stem.lower())

    videos = []
    for f in sorted(VIDEOS.glob("*.txt"), key=key):
        meta = parse_info_txt(f)
        yt = youtube_id(meta.get("youtube", ""))
        if not yt:
            print(f"  ! Video {f.name:<12} übersprungen — keine gültige YouTube-Angabe")
            continue
        videos.append({
            "slug":  f.stem,
            "title": meta.get("title", ""),
            "summary_paragraphs": meta.get("summary_paragraphs", []),
            "youtube_id": yt,
        })
        print(f"  · Video  {f.name:<12} {meta.get('title') or '(ohne Titel)'}")

    print(f"  → {len(videos)} Video(s) übernommen\n")
    return videos


def build():
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    site     = load("site.json")
    services = load("services.json")
    projects = prepare_projects(load("projects.json"))
    videos   = prepare_videos()
    scroll   = load("scroll.json")

    html = env.get_template("index.html").render(
        site=site,
        services=services,
        projects=projects,
        videos=videos,
        scroll=scroll,
        year=date.today().year,
    )

    OUT.write_text(html, encoding="utf-8")
    print(f"built index.html  —  {len(scroll['frames'])} Frames, {len(projects)} Projekte, "
          f"{len(videos)} Video(s), {len(services)} Leistungen")


def watched_files():
    return (list(DATA.glob("*.json")) + list(TEMPLATES.rglob("*"))
            + list(IMG_ALT.rglob("*")) + list(VIDEOS.glob("*.txt")))


def watch():
    stamps = {}
    print("watching for changes … Ctrl-C to stop")
    while True:
        changed = False
        seen = set()
        for f in watched_files():
            if f.is_file():
                seen.add(f)
                m = f.stat().st_mtime
                if stamps.get(f) != m:
                    stamps[f] = m
                    changed = True
        for f in list(stamps):
            if f not in seen:
                del stamps[f]
                changed = True
        if changed:
            try:
                build()
            except Exception as e:
                print("  ✗ build failed:", e)
        time.sleep(1)


if __name__ == "__main__":
    build()
    if "--watch" in sys.argv:
        watch()
