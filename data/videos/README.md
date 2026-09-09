# XR-Videos

Für jedes Video eine eigene `.txt`-Datei in diesem Ordner, z. B. `1.txt`, `2.txt` …
(diese Anleitung selbst — `README.md` — wird ignoriert, nur `*.txt` zählt).

Kein Video hier drin = der "Videos"-Abschnitt auf der Website erscheint einfach nicht.
Sobald die erste `.txt`-Datei mit einem gültigen `YouTube:`-Link auftaucht, erscheint
der Abschnitt automatisch — kein Code, keine Nachricht an Claude nötig.

## Format

```
Titel des Videos

YouTube: https://youtu.be/XXXXXXXXXXX

Kurze Beschreibung, ein oder mehrere Absätze.
```

Nur `YouTube:` ist wirklich nötig — Titel und Beschreibung können auch leer bleiben.
`python build.py` (oder `python build.py --watch`, während du bearbeitest) baut die
Seite neu.
