#!/usr/bin/env python3
"""
NeoKaizen Design — static site builder.

    python build.py            build once
    python build.py --watch    rebuild automatically while you edit

Edit content in  data/*.json ,  layout in  templates/ ,  styling in assets/css.
Never edit index.html by hand — it is generated and will be overwritten.
"""

import json, sys, time, shutil
from datetime import date
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT      = Path(__file__).parent
DATA      = ROOT / "data"
TEMPLATES = ROOT / "templates"
IMG       = ROOT / "assets" / "img" / "projects"
IMG_ALT   = ROOT / "images" / "Projects"
OUT       = ROOT / "index.html"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}
# Formate, die ein Browser NICHT anzeigen kann — werden gemeldet
BAD_EXT   = {".tif", ".tiff", ".bmp", ".heic", ".heif", ".psd", ".raw",
             ".cr2", ".nef", ".arw", ".dng", ".svg"}


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


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
            "summary": m.get("summary", ""),
            "tags":    m.get("tags",    []),
            "dir":     web,
            "cover":   cover,
            "images":  gallery,
        })

    print(f"  → {len(projects)} Projekt(e) übernommen\n")
    return projects


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
    scroll   = load("scroll.json")

    html = env.get_template("index.html").render(
        site=site,
        services=services,
        projects=projects,
        scroll=scroll,
        year=date.today().year,
    )

    OUT.write_text(html, encoding="utf-8")
    print(f"built index.html  —  {len(scroll['frames'])} Frames, {len(projects)} Projekte, {len(services)} Leistungen")


def watch():
    watched = list(DATA.glob("*.json")) + list(TEMPLATES.rglob("*"))
    stamps = {}
    print("watching for changes … Ctrl-C to stop")
    while True:
        changed = False
        for f in list(DATA.glob("*.json")) + list(TEMPLATES.rglob("*")):
            if f.is_file():
                m = f.stat().st_mtime
                if stamps.get(f) != m:
                    stamps[f] = m
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
