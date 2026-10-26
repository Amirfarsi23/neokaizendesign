/**
 * German / English, without touching the markup.
 *
 * The dictionary is keyed by the English string itself, and a DOM walk swaps
 * matching text nodes and title attributes. The original English is stashed on
 * the node the first time it runs, so switching back is exact. That keeps every
 * label in one file instead of scattering keys through the HTML.
 */

const DE = {
  'Click the same spot again to step through to the part behind it — that is how you reach drawer sides and bases. Shift + click adds each one to the selection, then Group locks them together.':
    'Noch einmal auf dieselbe Stelle klicken, um <b>durch</b> zum Teil dahinter zu springen — so erreichen Sie Schubladenwangen und -böden. <b>Umschalt + Klick</b> nimmt jedes weitere dazu, <b>Gruppieren</b> hält sie zusammen.',
  'Added objects land on the floor where you are looking. Move them with G, scale with S, remove with Delete. They live for this session only — they are not written into the saved project.':
    'Hinzugefügte Objekte landen dort auf dem Boden, wohin Sie schauen. Bewegen mit <b>G</b>, skalieren mit <b>S</b>, entfernen mit <b>Entf</b>. Sie bestehen nur für diese Sitzung und werden nicht mitgespeichert.',
  'Select a door, press Add hinge, then click the edge it should swing around.':
    'Tür auswählen, auf <em>Scharnier setzen</em> klicken, dann die Kante anklicken, um die sie schwingen soll.',
  'Contact us': 'Kontakt',
  'Cabinet': 'Schrank',
  'Drawers': 'Auszüge',
  'Wall unit': 'Hängeschrank',
  'Stove': 'Herd',
  'Fridge': 'Kühlschrank',
  'Dishwasher': 'Geschirrspüler',
  'Handle': 'Griff',
  'Loading the kitchen…': 'Küche wird geladen…',
  'Doors, drawers, materials and light — try all of it.':
    'Türen, Auszüge, Materialien und Licht — probieren Sie alles aus.',
  'Want your own design in here? Press “Contact us”.':
    'Ihr eigenes Projekt hier sehen? Auf <em>Kontakt</em> klicken.',
  'Open on a phone or headset': 'Auf Handy oder Headset öffnen',
  'Copy link': 'Link kopieren',
  'Close': 'Schließen',
  'Checking…': 'Wird geprüft…',
  'Eicha Kuchl is a demo': 'Eicha Kuchl ist eine Demo',
  /* toolbar */
  'Open model…': 'Modell öffnen…',
  'Demo kitchen': 'Demo-Küche',
  'Rig': 'Bauen',
  'Play': 'Vorführen',
  'Open all': 'Alle öffnen',
  'Close all': 'Alle schließen',
  'Export rig': 'Bewegungen exportieren',
  'Import rig': 'Bewegungen importieren',

  /* tabs */
  'Parts': 'Teile',
  'Material': 'Material',
  'Lights': 'Licht',
  'Scene': 'Szene',

  /* add to the scene */
  'Add to the scene': 'Zur Szene hinzufügen',
  'Furniture…': 'Möbel…',
  'Floor': 'Boden',
  'Wall': 'Wand',
  'Ceiling': 'Decke',

  /* selection */
  'Selection': 'Auswahl',
  'Nothing selected.': 'Nichts ausgewählt.',
  'Add hinge': 'Scharnier setzen',
  'Add drawer': 'Auszug setzen',
  'Group': 'Gruppieren',
  'Ungroup': 'Gruppe auflösen',
  'X-ray': 'Röntgen',
  'Hide': 'Ausblenden',
  'Show all': 'Alle anzeigen',
  'Snap to bounding-box edges (for messy geometry)':
    'An Hüllkörper-Kanten einrasten (bei unsauberer Geometrie)',

  /* motions */
  'Motions': 'Bewegungen',
  'Groups': 'Gruppen',
  'Transform': 'Transformation',
  'Reset transform': 'Transformation zurücksetzen',
  'Keys': 'Tastenkürzel',
  'Delete': 'Löschen',
  'Select': 'Auswählen',
  'Remove': 'Entfernen',
  'Test': 'Testen',
  'Flip': 'Umkehren',

  /* material */
  'Library': 'Bibliothek',
  'Use my own image…': 'Eigenes Bild verwenden…',
  'Adjust': 'Anpassen',
  'Texture size': 'Texturgröße',
  'Rotation': 'Drehung',
  'Roughness': 'Rauheit',
  'Metalness': 'Metallanteil',
  'Tint': 'Einfärbung',
  'Reset to original': 'Auf Original zurücksetzen',
  'none': 'nichts',
  'Wood': 'Holz',
  'Stone & tile': 'Stein & Fliesen',
  'Fabric': 'Stoff',
  'Wallpaper': 'Tapete',
  'Metal': 'Metall',
  'Paint': 'Lack',
  'Custom': 'Eigene',

  /* lights */
  'Place a light': 'Licht setzen',
  'Bulb': 'Glühbirne',
  'Spot': 'Strahler',
  'Strip': 'Lichtleiste',
  'Show light markers (never included in renders)':
    'Lichtmarkierungen zeigen (erscheinen nie im Rendering)',
  'No interior lights yet.': 'Noch keine Innenbeleuchtung.',
  'Brightness': 'Helligkeit',
  'Cone angle': 'Kegelwinkel',
  'Softness': 'Weichheit',
  'Range': 'Reichweite',
  'Length': 'Länge',
  'Depth': 'Tiefe',
  'Shadow': 'Schatten',
  'Move': 'Verschieben',

  /* scene */
  'Model orientation': 'Modellausrichtung',
  'Turntable': 'Drehteller',
  'Scale': 'Skalieren',
  'Model scale': 'Maßstab',
  'Reset': 'Zurücksetzen',
  'Section box': 'Schnittbox',
  'Cut the model down to a box you can drag':
    'Modell auf eine ziehbare Box beschneiden',
  'Fit to selection': 'An Auswahl anpassen',
  'Whole model': 'Ganzes Modell',
  'Lighting': 'Beleuchtung',
  'Sun direction': 'Sonnenrichtung',
  'Sun height': 'Sonnenhöhe',
  'Sun strength': 'Sonnenstärke',
  'Ambient': 'Umgebungslicht',
  'Exposure': 'Belichtung',
  'Background': 'Hintergrund',
  'Shadows': 'Schatten',
  'Render': 'Rendering',
  'Resolution': 'Auflösung',
  'Transparent background': 'Transparenter Hintergrund',
  'Logo in the corner': 'Logo in der Ecke',
  'Capture PNG': 'Als PNG speichern',
  'Export model for sharing (GLB)': 'Modell zum Teilen exportieren (GLB)',
  'Export for iPhone AR (USDZ)': 'Für iPhone-AR exportieren (USDZ)',
  'Make a share link…': 'Link zum Teilen…',
  'Studio': 'Studio',
  'Daylight': 'Tageslicht',
  'Evening': 'Abend',
  'Soft box': 'Softbox',

  /* gizmo bar */
  'Rotate': 'Drehen',
  'World': 'Welt',
  'Local': 'Lokal',
  'Snap': 'Einrasten',

  /* drop zone */
  'Drop a model here': 'Modell hier ablegen',
  'or press “Demo kitchen” to try it right away':
    'oder „Demo-Küche“ drücken, um sofort loszulegen',
  'Loading…': 'Wird geladen…',

  /* AR bar */
  'Lights on': 'Licht an',
  'Lights off': 'Licht aus',
  'Exit': 'Beenden',
  'View in AR': 'In AR ansehen',
  'Point at the floor, then tap to place':
    'Auf den Boden richten, dann tippen zum Platzieren',
  'Tap a door or drawer to open it':
    'Auf Tür oder Auszug tippen zum Öffnen',

  /* longer prose */
  'Sizes are in real metres and UVs are re-projected from the model, so a 0.3 m parquet tile is 0.3 m on the floor whatever the file\'s own unwrapping looked like.':
    'Größen sind echte Meter. Die UVs werden neu projiziert — eine 0,3-m-Parkettdiele ist auf dem Boden auch 0,3 m, egal wie die Datei abgewickelt war.',
  'Drag the coloured pads on each face to slide that side in or out. Hidden geometry stays selectable only inside the box, so you can work on one cupboard without the rest getting in the way.':
    'Ziehen Sie die farbigen Felder an jeder Fläche, um diese Seite hinein- oder herauszuschieben. Nur was in der Box liegt, bleibt anklickbar — so arbeiten Sie an einem Schrank, ohne dass der Rest stört.',
  'Renders the current camera view. Orbit to frame the shot first — the grid and selection outlines are left out of the image.':
    'Nimmt die aktuelle Kameraansicht auf. Erst den Bildausschnitt wählen — Raster und Auswahlrahmen kommen nicht mit ins Bild.',
  'Offsets are relative to where the part came in — the imported file\'s own transform is never touched, so Reset always gets you back.':
    'Verschiebungen sind relativ zur Importlage. Die Transformation der Datei bleibt unangetastet, Zurücksetzen bringt Sie also immer zurück.',
  'Pick a type, then click the surface it shines from — the underside of a wall unit for under-cabinet lighting, the ceiling for downlights. The beam follows that surface\'s direction.':
    'Typ wählen, dann die Fläche anklicken, von der das Licht ausgeht — die Unterseite eines Hängeschranks für Unterbaulicht, die Decke für Einbaustrahler. Der Strahl folgt der Flächenrichtung.',
  /* tooltips */
  'Move (G)': 'Verschieben (G)',
  'Rotate (R)': 'Drehen (R)',
  'Scale (S)': 'Skalieren (S)',
  'Snap to 10 mm / 15 degrees': 'Auf 10 mm / 15 Grad einrasten',
  'World or local axes': 'Welt- oder lokale Achsen',
  'Put the handles away (Esc)': 'Griffe ausblenden (Esc)',
  'Undo (Ctrl+Z)': 'Rückgängig (Strg+Z)',
  'Redo (Ctrl+Shift+Z)': 'Wiederholen (Strg+Umschalt+Z)',
  'Lock these parts together (Ctrl+G)': 'Teile zusammenfassen (Strg+G)',
  'Break the group apart (Ctrl+Shift+G)': 'Gruppe auflösen (Strg+Umschalt+G)',
  'Ghost everything except the selection (X)':
    'Alles außer der Auswahl durchsichtig machen (X)',
  'Hide the selected parts (H)': 'Ausgewählte Teile ausblenden (H)',
  'Show everything again (Shift+H)': 'Alles wieder einblenden (Umschalt+H)',
  'Tell us what is missing': 'Sagen Sie uns, was fehlt',

  /* keyboard legend */
  'Shift + click — add to selection':
    '<b>Umschalt + Klick</b> — zur Auswahl hinzufügen',
  'Alt + click — ignore grouping, pick the raw part':
    '<b>Alt + Klick</b> — Gruppierung ignorieren, Einzelteil wählen',
  'Ctrl+G — group · Ctrl+Shift+G — ungroup':
    '<b>Strg+G</b> — gruppieren · <b>Strg+Umschalt+G</b> — Gruppe lösen',
  'Ctrl+Z — undo · Ctrl+Shift+Z — redo':
    '<b>Strg+Z</b> — rückgängig · <b>Strg+Umschalt+Z</b> — wiederholen',
  'X — x-ray · H — hide · Shift+H — show all':
    '<b>X</b> — Röntgen · <b>H</b> — ausblenden · <b>Umschalt+H</b> — alle anzeigen',
  'G / R / S — move, rotate, scale handles':
    '<b>G / R / S</b> — Verschieben, Drehen, Skalieren',
  'F — frame selection · Esc — cancel':
    '<b>F</b> — Auswahl einpassen · <b>Esc</b> — abbrechen',

  /* strays the audit turned up */
  'View in VR': 'In VR ansehen',
  'This design is not on the server': 'Dieses Projekt liegt nicht auf dem Server',
  'This design could not be opened': 'Dieses Projekt konnte nicht geöffnet werden',
  'If something is missing or broken, tell us. That is what this is for.':
    'Wenn etwas fehlt oder nicht funktioniert, sagen Sie es uns. Genau dafür ist das hier da.'
};

const LANGS = { de: DE, en: null };
const STORE = 'eicha-kuchl:lang';

let current = 'en';

/** Translate a single string for use in dynamic messages. */
export function t(text) {
  if (current === 'en') return text;
  return LANGS[current]?.[text] ?? text;
}

export function language() {
  return current;
}

export function setLanguage(lang, root = document.body) {
  current = LANGS[lang] === undefined ? 'en' : lang;
  const dict = LANGS[current];

  walk(root, (node) => {
    const original = node.dataset.en ?? node.textContent;
    if (node.dataset.en === undefined) node.dataset.en = original;
    const key = collapse(original);
    node.textContent = dict?.[key] ?? original;
  }, (el) => {
    const original = el.dataset.enTitle ?? el.title;
    if (el.dataset.enTitle === undefined) el.dataset.enTitle = original;
    el.title = dict?.[collapse(original)] ?? original;
  });

  document.documentElement.lang = current;
  try { localStorage.setItem(STORE, current); } catch { /* private mode */ }
  return current;
}

export function storedLanguage() {
  try {
    return localStorage.getItem(STORE)
      ?? (navigator.language?.startsWith('de') ? 'de' : 'en');
  } catch {
    return 'en';
  }
}

const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

/**
 * Three passes, because three kinds of node need different handling:
 *
 *  - pure-text elements  -> swap textContent
 *  - prose with <b> in it -> swap innerHTML from the HTML dictionary, but only
 *    where nothing inside carries an id (that would be live content)
 *  - everything else      -> swap the individual text nodes, which is what
 *    catches headings like "Motions <span class=pill>12</span>"
 */
function walk(root, onText, onTitle) {
  const skip = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CANVAS']);
  const dict = LANGS[current];

  (function visit(el) {
    if (skip.has(el.tagName)) return;
    if (el.title) onTitle(el);

    const kids = [...el.childNodes];
    const onlyText = kids.length > 0 && kids.every((n) => n.nodeType === Node.TEXT_NODE);

    if (onlyText && collapse(el.textContent)) {
      onText(el);
      return;
    }

    // prose that contains inline emphasis but no live elements
    const hasText = kids.some((n) => n.nodeType === Node.TEXT_NODE && collapse(n.nodeValue));
    if (hasText && !el.querySelector('[id]')) {
      const original = el.dataset.enHtml ?? el.innerHTML;
      if (el.dataset.enHtml === undefined) el.dataset.enHtml = original;
      // Key off the English stashed on the first visit, never the live text:
      // the inline <em> inside gets translated by the pass below, so by the
      // second run the live text is half-German and matches nothing.
      if (el.dataset.enText === undefined) el.dataset.enText = collapse(el.textContent);
      const key = el.dataset.enText;
      const replacement = dict?.[key];
      if (replacement !== undefined) {
        el.innerHTML = replacement;
        return;
      }
      el.innerHTML = original;
    }

    // headings and rows that mix a label with a live counter
    for (const node of kids) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const original = node.__en ?? node.nodeValue;
      if (node.__en === undefined) node.__en = original;
      const key = collapse(original);
      if (!key) continue;
      const hit = dict?.[key];
      node.nodeValue = hit === undefined ? original : original.replace(key, hit);
    }

    for (const child of el.children) visit(child);
  })(root);
}
