/* ===========================================================
   NeoKaizen — Projekte als Raum

   Die Projekte hängen als Tafeln um den Betrachter herum, so wie
   man sie in einer Brille sehen würde. Scrollen dreht den Raum,
   die Maus schaut sich um, ein Klick fliegt in ein Projekt hinein.

   Gebaut wie der Rest der Seite: kein Framework, nur three.js.
   =========================================================== */

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const DATA = window.NKD_GALLERY;
if (!DATA || !DATA.projects || !DATA.projects.length) throw new Error('keine Projektdaten');

/* ---------- Maße des Raums ----------
   Ein Handy ist hochkant und schmal: dieselbe Entfernung wie am Monitor
   lässt die Tafeln zu Briefmarken schrumpfen. Also rückt der Raum näher
   und wird schmaler bestückt. Festgelegt beim Laden, nicht beim Drehen —
   nach einem Wechsel ins Querformat genügt ein Neuladen. */
const NARROW = innerWidth < 760 || innerWidth < innerHeight;
/* Weniger Bewegung heißt nicht keine Bewegung: der Raum bleibt, aber die
   Kamera hört auf, von selbst zu atmen, und die Tafeln kommen alle
   gleichzeitig statt nacheinander. */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Am Telefon wird gezogen und getippt, nicht gescrollt und geklickt.
   Ein Hinweis, der die falsche Geste nennt, ist schlimmer als keiner. */
const TOUCH = matchMedia('(pointer: coarse)').matches;
const HINT_ROOM    = TOUCH ? 'Ziehen dreht den Raum · Projekt antippen' : null;
const HINT_PROJECT = TOUCH ? 'Bild antippen · zum Schließen Zurück' : 'Bild anklicken · Esc zurück';

const COVER_RADIUS    = NARROW ? 6.2 : 9.5;   // Abstand der Projekttafeln
const COVER_Y_SPREAD  = NARROW ? 0.0 : 1.3;   // Streuung in der Höhe
const COVER_PER_ROW   = NARROW ? 4   : 8;     // hochkant passen nicht acht nebeneinander
const COVER_ROW_SPACING = 4.0;
const SHOT_RADIUS     = NARROW ? 5.6 : 7.6;   // Bilder innerhalb eines Projekts
const SHOT_PER_ROW    = NARROW ? 4   : 7;
const ROW_SPACING     = NARROW ? 3.4 : 3.5;
/* Eine Tafel darf nie so hoch werden, dass sie der Reihe darüber ins
   Bild wächst — aber auch nicht kleiner bleiben, als der Platz hergibt.
   Früher stand hier eine feste Obergrenze (2.8). Die hat auf dem Monitor
   ein Drittel der verfügbaren Fläche verschenkt: ein 1800-Pixel-Foto kam
   auf 456 Bildschirmpixel heraus. Jetzt begrenzt nur noch der
   Reihenabstand, und das auch nur, wenn es überhaupt zwei Reihen gibt. */
const ROW_FILL        = 0.84;

const SPIN_WHEEL      = 0.0016;  // Rad -> Drehung
const SPIN_DRAG       = 0.004;   // Finger/Maus-Ziehen -> Drehung
const SPIN_FRICTION   = 0.94;
const EASE            = 0.08;    // allgemeine Annäherung pro Frame
const MAX_YAW         = Math.PI / 7;
const MAX_PITCH       = Math.PI / 11;
const HOVER_SCALE     = 1.06;
const FOCUS_DIST      = 4.2;     // wie nah ein angeklicktes Bild kommt

const BG = 0x05060a;

/* ---------- Grundgerüst ---------- */
const stage    = document.getElementById('xr-stage');
const hud      = document.getElementById('xr-hud');
const panel    = document.getElementById('xr-panel');
const titleEl  = document.getElementById('xr-title');
const metaEl   = document.getElementById('xr-meta');
const textEl   = document.getElementById('xr-text');
const tagsEl   = document.getElementById('xr-tags');
const backBtn  = document.getElementById('xr-back');
const hintEl   = document.getElementById('xr-hint');
const loadEl   = document.getElementById('xr-loading');
const vrSlot   = document.getElementById('xr-vr');

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
/* Der Dunst soll Tiefe andeuten, nicht die Bilder dämpfen. Bei 0.042
   kam von einem Foto auf 9.5 Metern nur noch 85 % der Helligkeit an —
   genau das sah nach schlechterer Qualität aus. Bei 0.018 sind es 97 %,
   und der Staub in zwanzig Metern verschwindet trotzdem im Schwarz. */
scene.fog = new THREE.FogExp2(BG, 0.018);

const camera = new THREE.PerspectiveCamera(NARROW ? 80 : 72, innerWidth / innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
stage.appendChild(renderer.domElement);

/* Alles Sichtbare hängt im Rig. In VR bewegt die Brille die Kamera,
   also wird gedreht, was um den Betrachter steht — nie die Kamera. */
const rig = new THREE.Group();
scene.add(rig);

const overviewGroup = new THREE.Group();
const projectGroup  = new THREE.Group();
rig.add(overviewGroup, projectGroup);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}, { passive: true });

/* ---------- Staub: gibt der Drehung etwas zum Vorbeiziehen ---------- */
(function dust() {
  const n = 420, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 6 + Math.random() * 16, t = Math.random() * Math.PI * 2;
    pos[i * 3]     = Math.cos(t) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = Math.sin(t) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rig.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x1C39BB, size: 0.055, transparent: true, opacity: 0.5, depthWrite: false,
  })));
})();

/* ---------- Texturen ---------- */
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const texCache = new Map();

const url = (p) => encodeURI(DATA.base + p);

function texture(pic) {
  const key = pic.webp || pic.src;
  if (texCache.has(key)) return texCache.get(key);
  const p = new Promise((resolve, reject) => {
    loader.load(url(key), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(t);
    }, undefined, reject);
  });
  texCache.set(key, p);
  return p;
}

function texAspect(tex) {
  const img = tex.image;
  return (img && img.width && img.height) ? img.width / img.height : 16 / 9;
}

/* Wie groß darf eine Tafel sein?

   Am Monitor war das egal — dort ist der Bildausschnitt breit und es
   passt alles. Hochkant auf einem Telefon ist er schmal: dieselbe Tafel
   ragte links und rechts aus dem Bild und lag gleichzeitig auf ihrer
   Nachbarin. Also wird nicht mehr eine feste Höhe gesetzt, sondern aus
   zwei Grenzen die kleinere genommen — was der Bildausschnitt hergibt,
   und was der Platz auf dem Kreis hergibt. */
function fitSize(aspect, radius, step, maxH) {
  const visH = 2 * radius * Math.tan((camera.fov * Math.PI / 180) / 2);
  const visW = visH * camera.aspect;
  const maxW = Math.min(visW * 0.9, radius * step * 0.9);
  const h = Math.min(visH * 0.62, maxW / aspect, maxH || Infinity);
  return { h: Math.max(0.9, h), w: Math.max(0.9, h) * aspect };
}

function makePanel(tex, height) {
  const aspect = texAspect(tex);
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  /* dünner Rand, damit die Tafel im Schwarz eine Kante hat */
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x1C39BB, transparent: true, opacity: 0 })
  );
  mesh.add(edge);
  mesh.userData.edge = edge;
  return mesh;
}

/* auf dem Kreis platzieren und zur Mitte drehen */
function placeOnRing(mesh, angle, radius, y) {
  mesh.position.set(Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
  mesh.lookAt(0, y * 0.35, 0);
  mesh.userData.home = mesh.position.clone();
  mesh.userData.homeQuat = mesh.quaternion.clone();
}

/* ---------- Schwebeschrift (funktioniert auch in VR) ---------- */
function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.font = '600 62px Syne, sans-serif';
  x.fillStyle = '#dce4f0';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2, c.width - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Jede Projekttafel trägt ihren Namen fest unter sich — man soll nicht
   erst suchen müssen, wo man gerade hinsieht. Zwei Zeilen: Titel, Ort. */
function coverLabel(title, location, width) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '600 56px Syne, sans-serif';
  x.fillStyle = '#dce4f0';
  x.fillText(title, c.width / 2, 48, c.width - 40);
  if (location) {
    x.font = '400 34px "DM Mono", monospace';
    x.fillStyle = '#00A896';
    x.fillText(location.toUpperCase(), c.width / 2, 112, c.width - 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  /* Die Schrift ist so breit wie ihre Tafel — nie breiter. Sonst stand
     der Name auf dem Telefon über den Bildrand hinaus im Nichts. */
  const w = Math.max(2.2, Math.min(width || 4, 4.4));
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, w * 0.15625),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })
  );
}

const label = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 0.5),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false })
);
label.renderOrder = 10;
rig.add(label);
let labelFor = null;

function showLabel(mesh, text) {
  if (labelFor !== mesh) {
    labelFor = mesh;
    if (label.material.map) label.material.map.dispose();
    label.material.map = labelTexture(text);
    /* von "keine Textur" auf "Textur" muss der Shader neu gebaut werden —
       ohne das bleibt die Tafel einfach weiß */
    label.material.needsUpdate = true;
  }
  const box = new THREE.Box3().setFromObject(mesh);
  label.position.set(mesh.position.x, box.min.y - 0.45, mesh.position.z).multiplyScalar(0.98);
  label.quaternion.copy(mesh.quaternion);
}

/* ---------- Zustand ---------- */
let mode = 'overview';          // 'overview' | 'project'
let covers = [];
let shots  = [];
let current = null;             // offenes Projekt
let focused = null;             // herangeholtes Bild

let spin = 0, spinTarget = 0, spinVel = 0;
let yaw = 0, pitch = 0, yawTarget = 0, pitchTarget = 0;
let ready = false;

/* ---------- Übersicht aufbauen ---------- */
async function buildOverview() {
  /* Die Namen werden in ein Canvas gemalt. Wer zu früh malt, malt in
     Arial — also erst warten, bis Syne und DM Mono da sind. */
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const list = DATA.projects;
  let done = 0;
  const made = await Promise.all(list.map(async (p, i) => {
    let tex;
    try { tex = await texture(p.cover); }
    catch { return null; }
    loadEl.textContent = `Umgebung wird geladen … ${++done}/${list.length}`;

    const perRow = Math.min(COVER_PER_ROW, list.length);
    const rows   = Math.ceil(list.length / perRow);
    const step   = (Math.PI * 2) / perRow;
    const row    = Math.floor(i / perRow);
    const k      = i % perRow;

    const size = fitSize(texAspect(tex), COVER_RADIUS, step,
                         rows > 1 ? COVER_ROW_SPACING * ROW_FILL : 0);
    const mesh = makePanel(tex, size.h);

    /* Beide Reihen auf derselben Achse: so steht an jeder der vier
       Positionen ein Paar übereinander und der Blick ist gefüllt.
       Versetzt sah man immer nur eine Tafel und darüber viel Nichts. */
    const angle = k * step;
    const y = rows === 1
      ? Math.sin(i * 2.4) * COVER_Y_SPREAD
      : (row - (rows - 1) / 2) * COVER_ROW_SPACING;
    const jitter = rows === 1 ? Math.sin(i * 1.7) * 0.7 : 0;
    placeOnRing(mesh, angle, COVER_RADIUS + jitter, y);
    mesh.userData.project = p;
    mesh.userData.index = i;
    /* 45 ms Abstand: acht Tafeln, die gleichzeitig aufblenden, sind ein
       Blitz — nacheinander ist es ein Raum, der sich füllt. */
    mesh.userData.fadeAt = performance.now() + (REDUCED ? 0 : i * 45);

    /* Als Kind der Tafel: dreht und bewegt sich mit, ohne eigene Rechnerei */
    const name = coverLabel(p.title, p.location, size.w);
    name.position.set(0, -size.h / 2 - 0.42, 0.02);
    mesh.add(name);
    mesh.userData.name = name;

    overviewGroup.add(mesh);
    return mesh;
  }));
  covers = made.filter(Boolean);
  if (!covers.length) throw new Error('keine Bilder ladbar');
  loadEl.hidden = true;
  hud.classList.add('is-ready');
  ready = true;
}

/* ---------- Ein Projekt betreten ---------- */
async function openProject(p, fromMesh) {
  if (mode === 'project') return;
  mode = 'project';
  current = p;
  focused = null;

  titleEl.textContent = p.title;
  metaEl.textContent = [String(p.index).padStart(2, '0'), p.location, p.type, p.client, p.year]
    .filter(Boolean).join(' · ');
  textEl.innerHTML = '';
  for (const para of p.text) {
    const el = document.createElement('p');
    el.textContent = para;
    textEl.appendChild(el);
  }
  tagsEl.innerHTML = '';
  for (const t of p.tags) {
    const el = document.createElement('span');
    el.className = 'xr-tag';
    el.textContent = t;
    tagsEl.appendChild(el);
  }
  panel.classList.add('is-open');
  hintEl.textContent = HINT_PROJECT;
  label.material.opacity = 0;
  labelFor = null;

  /* Die Übersicht weicht zurück, nicht aus. */
  for (const c of covers) c.userData.fade = (c === fromMesh) ? 'ghost' : 'out';

  /* Der Ring des Projekts beginnt dort, wo das angeklickte Cover stand,
     damit das Hineinfliegen eine Richtung hat. */
  const startAngle = fromMesh ? Math.atan2(fromMesh.position.x, -fromMesh.position.z) : 0;

  const pics = p.images.slice(0, 24);
  const rows = Math.ceil(pics.length / SHOT_PER_ROW);

  await Promise.all(pics.map(async (pic, i) => {
    if (mode !== 'project' || current !== p) return;      // zwischendurch zurück
    let tex;
    try { tex = await texture(pic); } catch { return; }
    if (mode !== 'project' || current !== p) return;

    const row = Math.floor(i / SHOT_PER_ROW);
    const inRow = pics.slice(row * SHOT_PER_ROW, (row + 1) * SHOT_PER_ROW).length;
    const k = i - row * SHOT_PER_ROW;

    /* Fester Winkelabstand statt eines Fächers, der sich mit der Anzahl
       zusammenzieht: der Fächer war schuld daran, dass vier Bilder auf
       dem Telefon übereinander lagen. */
    const step = (Math.PI * 2) / SHOT_PER_ROW;
    const angle = startAngle + (k - (inRow - 1) / 2) * step;
    const y = (rows === 1 ? 0 : (row - (rows - 1) / 2) * ROW_SPACING) + Math.sin(i * 1.9) * 0.18;

    const size = fitSize(texAspect(tex), SHOT_RADIUS, step,
                         rows > 1 ? ROW_SPACING * ROW_FILL : 0);
    const mesh = makePanel(tex, size.h);
    placeOnRing(mesh, angle, SHOT_RADIUS + Math.cos(i * 2.1) * 0.35, y);
    mesh.userData.caption = pic.caption || p.title;
    mesh.userData.fade = 'in';
    mesh.position.multiplyScalar(1.35);                   // kommt von weiter hinten herein
    projectGroup.add(mesh);
    shots.push(mesh);
  }));
}

function closeProject() {
  if (mode !== 'project') return;
  mode = 'overview';
  current = null;
  focused = null;
  panel.classList.remove('is-open');
  hintEl.textContent = HINT_ROOM || DATA.hint;
  for (const m of shots) m.userData.fade = 'out';
  for (const c of covers) c.userData.fade = 'in';
  label.material.opacity = 0;
  labelFor = null;
}

backBtn.addEventListener('click', closeProject);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { focused ? unfocus() : closeProject(); } });

/* ---------- Ein einzelnes Bild heranholen ---------- */
function focusShot(mesh) {
  if (focused === mesh) return unfocus();
  if (focused) unfocus();
  focused = mesh;
  mesh.renderOrder = 5;
  mesh.material.depthTest = false;
}
function unfocus() {
  if (!focused) return;
  focused.renderOrder = 0;
  focused.material.depthTest = true;
  focused = null;
}

/* ---------- Zeigen und Auswählen ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

function pickables() {
  return mode === 'overview' ? covers : shots;
}

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables(), false);
  return hits.length ? hits[0].object : null;
}

function setHover(mesh) {
  if (hovered === mesh) return;
  hovered = mesh;
  stage.style.cursor = mesh ? 'pointer' : '';
  if (mesh && mode === 'project' && mesh.userData.caption) showLabel(mesh, mesh.userData.caption);
}

/* ---------- Maus, Rad, Finger ---------- */
let dragging = false, dragX = 0, dragY = 0, dragDist = 0, downTime = 0;

addEventListener('mousemove', (e) => {
  if (renderer.xr.isPresenting) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  yawTarget   = -pointer.x * MAX_YAW;
  pitchTarget =  pointer.y * MAX_PITCH;
}, { passive: true });

addEventListener('wheel', (e) => {
  if (focused) return;
  spinTarget += e.deltaY * SPIN_WHEEL;
}, { passive: true });

stage.addEventListener('pointerdown', (e) => {
  dragging = true; dragX = e.clientX; dragY = e.clientY; dragDist = 0;
  downTime = performance.now();
  spinVel = 0;
});

addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY;
  dragDist += Math.abs(dx) + Math.abs(dy);
  dragX = e.clientX; dragY = e.clientY;
  if (!focused) { spinTarget -= dx * SPIN_DRAG; spinVel = -dx * SPIN_DRAG; }
  if (e.pointerType === 'touch') {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  }
}, { passive: true });

addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  const wasTap = dragDist < 12 && performance.now() - downTime < 400;
  if (!wasTap || !ready) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  activate(pick());
});

function activate(mesh) {
  if (!mesh) { if (focused) unfocus(); return; }
  if (mode === 'overview') openProject(mesh.userData.project, mesh);
  else focusShot(mesh);
}

/* ---------- VR ---------- */
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    vrSlot.appendChild(VRButton.createButton(renderer));
    vrSlot.hidden = false;
  }).catch(() => {});
}

const tmpMatrix = new THREE.Matrix4();
for (const i of [0, 1]) {
  const controller = renderer.xr.getController(i);
  controller.addEventListener('selectstart', () => {
    tmpMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
    const hits = raycaster.intersectObjects(pickables(), false);
    if (hits.length) activate(hits[0].object);
    else if (mode === 'project') closeProject();
  });
  /* Strahl, damit man sieht, worauf man zeigt */
  const ray = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -6)]),
    new THREE.LineBasicMaterial({ color: 0x00A896, transparent: true, opacity: 0.6 })
  );
  controller.add(ray);
  scene.add(controller);
}

/* Daumenstick dreht den Raum, wenn eine Brille da ist */
function xrSpin() {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const axes = src.gamepad && src.gamepad.axes;
    if (axes && axes.length > 2 && Math.abs(axes[2]) > 0.15) spinTarget += axes[2] * 0.02;
  }
}

/* ---------- Bild für Bild ---------- */
const tmpV = new THREE.Vector3();
const clock = new THREE.Clock();

function fade(mesh, to, speed) {
  const m = mesh.material;
  m.opacity += (to - m.opacity) * speed;
  if (mesh.userData.edge) mesh.userData.edge.material.opacity = m.opacity * 0.5;
  return m.opacity;
}

function frame() {
  const t = clock.getElapsedTime();

  if (renderer.xr.isPresenting) {
    xrSpin();
  } else {
    /* ruhiges Nachführen des Blicks, plus ein kaum sichtbares Atmen —
       daher kommt das Gefühl, eine Brille aufzuhaben */
    yaw   += (yawTarget   - yaw)   * EASE;
    pitch += (pitchTarget - pitch) * EASE;
    const breathX = REDUCED ? 0 : Math.sin(t * 0.33) * 0.004;
    const breathY = REDUCED ? 0 : Math.sin(t * 0.21) * 0.005;
    camera.rotation.set(pitch + breathX, yaw + breathY, 0, 'YXZ');
  }

  spinVel *= SPIN_FRICTION;
  spinTarget += spinVel;
  spin += (spinTarget - spin) * EASE;
  const spinGroup = mode === 'overview' ? overviewGroup : projectGroup;
  overviewGroup.rotation.y = projectGroup.rotation.y = spin;

  /* Jeden Frame neu prüfen, worauf gezeigt wird: beim Drehen bleibt der
     Mauszeiger stehen, aber unter ihm wandert der Raum weiter. */
  if (ready && !renderer.xr.isPresenting) setHover(pick());

  for (const mesh of covers) {
    const want = mesh.userData.fade || 'in';
    if (want === 'in' && performance.now() < (mesh.userData.fadeAt || 0)) continue;
    fade(mesh, want === 'in' ? 1 : 0, want === 'in' ? 0.08 : 0.15);
    const grow = (mesh === hovered && mode === 'overview') ? HOVER_SCALE : 1;
    const away = want === 'in' ? 1 : 1.25;
    mesh.scale.setScalar(mesh.scale.x + (grow * away - mesh.scale.x) * 0.12);
    mesh.visible = mesh.material.opacity > 0.01;
    /* Der Name hängt an der Tafel: immer da, beim Zeigen etwas heller. */
    if (mesh.userData.name) {
      mesh.userData.name.material.opacity =
        mesh.material.opacity * (mesh === hovered ? 1 : 0.68);
    }
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const mesh = shots[i];
    const out = mesh.userData.fade === 'out';
    const o = fade(mesh, out ? 0 : 1, out ? 0.16 : 0.09);
    if (out && o < 0.02) {                       // aufgeräumt wird erst nach dem Ausblenden
      projectGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      shots.splice(i, 1);
      continue;
    }
    const home = mesh.userData.home;
    if (mesh === focused) {
      /* vor den Betrachter ziehen, in seine Blickrichtung */
      camera.getWorldDirection(tmpV);
      tmpV.multiplyScalar(FOCUS_DIST).applyAxisAngle(new THREE.Vector3(0, 1, 0), -spinGroup.rotation.y);
      mesh.position.lerp(tmpV, 0.14);
      mesh.quaternion.slerp(camera.quaternion, 0.14);
      mesh.scale.setScalar(mesh.scale.x + (1.35 - mesh.scale.x) * 0.12);
    } else {
      mesh.position.lerp(home, out ? 0.08 : 0.1);
      mesh.quaternion.slerp(mesh.userData.homeQuat, 0.1);
      const grow = mesh === hovered ? HOVER_SCALE : 1;
      mesh.scale.setScalar(mesh.scale.x + (grow - mesh.scale.x) * 0.12);
    }
  }

  /* Die schwebende Schrift ist nur noch für einzelne Bilder da — in der
     Übersicht steht der Name ohnehin unter jeder Tafel. */
  if (hovered && mode === 'project' && hovered.visible !== false) {
    label.material.opacity += (0.9 - label.material.opacity) * 0.12;
    showLabel(hovered, hovered.userData.caption);
  } else {
    label.material.opacity += (0 - label.material.opacity) * 0.15;
  }

  renderer.render(scene, camera);
}

/* ---------- Start ---------- */
hintEl.textContent = HINT_ROOM || DATA.hint;
buildOverview()
  .then(() => renderer.setAnimationLoop(frame))
  .catch((err) => {
    console.error(err);
    document.body.classList.add('xr-failed');
  });
