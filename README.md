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

Jeder Projektordner hat eine `info.txt` (z. B. `images/Projects/1/info.txt`) —
die 8 bestehenden Ordner haben bereits eine leere Datei, einfach reinschreiben:

```
Wohnhaus Landshut

Ihre Kunden sehen Linien auf Papier. Wir zeigen ihnen ihr Zuhause.
Zweiter Absatz, falls gewünscht.
```

Erste Zeile = Titel, danach eine Leerzeile, danach die Beschreibung
(ein oder mehrere Absätze). Bleibt die Datei leer, wird einfach der
Ordnername als Titel angezeigt — wie bisher.

Wer mehr Kontrolle will, kann stattdessen (oder zusätzlich) mit
`Schlüssel: Wert`-Zeilen am Anfang der Datei arbeiten:

```
Title: Wohnhaus Landshut
Type: Innenraum
Client: Bauträger XY
Year: 2026
Tags: 3D-Design, VR
YouTube: https://youtu.be/XXXXXXXXXXX

Ihre Kunden sehen Linien auf Papier. Wir zeigen ihnen ihr Zuhause.
```

Nur die Zeilen eintragen, die gebraucht werden — der Rest bleibt einfach leer.
`YouTube:` ist optional: sobald gesetzt, zeigt die Projektkarte darunter ein
Vorschaubild mit Play-Button; das eigentliche Video (via youtube-nocookie.com)
lädt erst, wenn jemand draufklickt.

Neues Projekt = neuer Ordner mit Bildern (und optional `info.txt`) unter
`images/Projects/`, dann `python build.py` — völlig automatisch, keine
weitere Änderung nötig.

(`data/projects.json` funktioniert weiterhin als Alternative/Ergänzung,
falls du JSON lieber magst — `info.txt` gewinnt bei doppelten Angaben.)

## Videos

Ein eigener "Videos"-Abschnitt für XR-Videos, unabhängig von den Projekten.
Siehe `data/videos/README.md` — kurz gesagt: eine `.txt`-Datei pro Video in
`data/videos/`, mit einem `YouTube:`-Link darin. Ohne Videos bleibt der
Abschnitt einfach unsichtbar; die erste Datei lässt ihn automatisch erscheinen.

## Scroll-Story

Texte: `data/scroll.json`
Geschwindigkeit: `--story-len` oben in `assets/css/scroll.css`
Bilder: `assets/img/scroll/`
