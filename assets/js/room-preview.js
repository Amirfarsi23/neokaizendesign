/* ===========================================================
   NeoKaizen — Vorschau auf den Projektraum

   Dasselbe Prinzip wie in projekte/, nur klein, langsam und ohne
   Bedienung: ein Ausschnitt, der sich von selbst dreht und zeigt,
   was hinter dem Knopf liegt. Alles Interaktive bleibt drüben.
   =========================================================== */

import * as THREE from 'three';

const DATA = window.NKD_PREVIEW;
const stage = document.querySelector('.room-preview-stage');
if (!DATA || !DATA.covers || !DATA.covers.length || !stage) throw new Error('keine Vorschau');

const RADIUS = 5.4;
const HEIGHT = 2.5;
const SPEED  = 0.085;          // Umdrehung in Ruhe — bewusst langsam
const BG     = 0x05060a;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.075);

const camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.1, 60);
const ring = new THREE.Group();
scene.add(ring);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
} catch {
  throw new Error('kein WebGL');   // das Standbild bleibt einfach liegen
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(stage);
resize();

const loader = new THREE.TextureLoader();
const url = (p) => encodeURI(DATA.base + p);

const covers = DATA.covers.slice(0, 8);
let loaded = 0;

covers.forEach((c, i) => {
  loader.load(url(c.webp || c.src), (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = tex.image;
    const aspect = (img && img.width && img.height) ? img.width / img.height : 16 / 9;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(HEIGHT * aspect, HEIGHT),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 })
    );
    const angle = (i / covers.length) * Math.PI * 2;
    const y = Math.sin(i * 2.4) * 0.8;
    mesh.position.set(Math.sin(angle) * RADIUS, y, -Math.cos(angle) * RADIUS);
    mesh.lookAt(0, y * 0.35, 0);
    mesh.userData.at = performance.now() + i * 60;   // nacheinander, nicht auf einmal
    ring.add(mesh);

    /* Das Standbild weicht erst, wenn wirklich etwas zu sehen ist. */
    if (++loaded === 1) {
      stage.classList.add('is-live');
      renderer.setAnimationLoop(frame);
    }
  });
});

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  ring.rotation.y += SPEED * dt;
  for (const m of ring.children) {
    if (m.material.opacity < 1 && now >= m.userData.at) {
      m.material.opacity = Math.min(1, m.material.opacity + dt * 1.2);
    }
  }
  renderer.render(scene, camera);
}

/* Außer Sicht wird nicht gerechnet — die Vorschau steht weit oben auf einer
   langen Seite und soll niemandem den Akku kosten, während er unten liest. */
new IntersectionObserver((entries) => {
  const visible = entries.some(e => e.isIntersecting);
  if (visible && loaded) { last = performance.now(); renderer.setAnimationLoop(frame); }
  else renderer.setAnimationLoop(null);
}, { rootMargin: '100px' }).observe(stage);

addEventListener('pagehide', () => renderer.setAnimationLoop(null));
