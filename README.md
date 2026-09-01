# NeoKaizen Design — Website

Statische Seite. Inhalt kommt aus JSON, HTML wird generiert.

## Bauen

```bash
pip install jinja2
python build.py            # einmal bauen
python build.py --watch    # automatisch neu bauen beim Bearbeiten
```

`index.html` ist **generiert** — niemals von Hand bearbeiten.

## Projekte

Projekte werden **automatisch** aus den Ordnern in `images/Projects/` gelesen.

1. Ordner anlegen: `images/Projects/10/`
2. Bilder hineinlegen (`1.jpg`, `2.jpg`, …). Das erste Bild liegt oben auf dem Stapel.
3. `python build.py`

Ohne weitere Angaben heißt das Projekt wie der Ordner. Leere Ordner werden übersprungen.

### Titel und Beschreibung ergänzen

Später in `data/projects.json`, mit dem Ordnernamen als Schlüssel:

```json
{
  "1": {
    "title": "Wohnhaus Landshut",
    "type": "Innenraum",
    "client": "Bauträger XY",
    "year": "2026",
    "summary": "Ein Satz dazu.",
    "tags": ["3D-Design", "VR"]
  }
}
```

Nur die Felder eintragen, die gebraucht werden — der Rest bleibt einfach leer.

## Scroll-Story

Texte: `data/scroll.json`
Geschwindigkeit: `--story-len` oben in `assets/css/scroll.css`
Bilder: `assets/img/scroll/`
