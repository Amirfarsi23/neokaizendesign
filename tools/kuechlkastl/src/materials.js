import * as THREE from 'three';

/**
 * Procedural material library.
 *
 * Textures are generated on a canvas rather than downloaded, so the app stays
 * self-contained and every pattern can be recoloured without shipping assets.
 * Each definition draws one seamless tile; physical size, rotation and tint are
 * applied afterwards through the texture transform.
 */

const TILE = 512;

/* ------------------------------------------------------------- noise ----- */

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value-noise field sampled in [0,1). */
function noiseField(freq, rnd) {
  const g = new Float32Array(freq * freq);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (u, v) => {
    const x = u * freq;
    const y = v * freq;
    const x0 = ((Math.floor(x) % freq) + freq) % freq;
    const y0 = ((Math.floor(y) % freq) + freq) % freq;
    const x1 = (x0 + 1) % freq;
    const y1 = (y0 + 1) % freq;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * freq + x0];
    const b = g[y0 * freq + x1];
    const c = g[y1 * freq + x0];
    const d = g[y1 * freq + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

function fbmFields(freqs, seed) {
  const rnd = mulberry32(seed);
  return freqs.map((f) => noiseField(f, rnd));
}

function fbm(fields, u, v) {
  let sum = 0;
  let amp = 1;
  let total = 0;
  for (const f of fields) {
    sum += amp * f(u, v);
    total += amp;
    amp *= 0.5;
  }
  return sum / total;
}

/* --------------------------------------------------------- canvas utils -- */

function newCanvas(size = TILE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function mix(hexA, hexB, t) {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  return a.lerp(b, t).getStyle();
}

/** Per-pixel paint helper — cb(x, y, u, v) returns a css colour or [r,g,b]. */
function paint(size, cb) {
  const canvas = newCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const col = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      col.set(cb(x, y, x / size, y / size));
      const i = (y * size + x) * 4;
      img.data[i] = col.r * 255;
      img.data[i + 1] = col.g * 255;
      img.data[i + 2] = col.b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Derive a tangent-space normal map from a canvas's luminance. */
function normalFromCanvas(canvas, strength = 2) {
  const { width: w, height: h } = canvas;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const lum = (x, y) => {
    const xi = ((x % w) + w) % w;
    const yi = ((y % h) + h) % h;
    const i = (yi * w + xi) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (dx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  const c = newCanvas(w);
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

/* ------------------------------------------------------------ patterns --- */

function woodGrain(light, dark, { planks = 4, seed = 7, ringiness = 26 } = {}) {
  const fields = fbmFields([4, 12, 40], seed);
  const warp = fbmFields([3, 9], seed + 1);
  return paint(TILE, (x, y, u, v) => {
    const plank = Math.floor(v * planks);
    const offset = ((plank * 0.37) % 1);           // stagger each plank
    const uu = (u + offset) % 1;
    const local = v * planks - plank;              // 0..1 within the plank

    const wob = (fbm(warp, uu, v) - 0.5) * 0.35;
    const rings = Math.sin((uu * ringiness) + wob * 8 + plank * 2.1);
    const grain = fbm(fields, uu * 2, v * 6);
    let t = 0.5 + rings * 0.22 + (grain - 0.5) * 0.5;

    // darken the plank joints
    const edge = Math.min(local, 1 - local);
    if (edge < 0.012) t -= 0.45;

    return mix(dark, light, THREE.MathUtils.clamp(t, 0, 1));
  });
}

function herringbone(light, dark, { blocks = 6, seed = 11 } = {}) {
  const canvas = newCanvas();
  const ctx = canvas.getContext('2d');
  const grain = woodGrain(light, dark, { planks: 1, seed, ringiness: 40 });
  const s = TILE / blocks;

  ctx.fillStyle = mix(dark, light, 0.25);
  ctx.fillRect(0, 0, TILE, TILE);

  // two interleaved runs of planks at +/-45 degrees
  for (let i = -blocks; i < blocks * 2; i++) {
    for (let j = -blocks; j < blocks * 2; j++) {
      const flip = (i + j) % 2 === 0;
      ctx.save();
      ctx.translate(i * s, j * s);
      ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      ctx.drawImage(grain, 0, 0, TILE, TILE, -s * 0.9, -s * 0.32, s * 1.8, s * 0.64);
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.9, -s * 0.32, s * 1.8, s * 0.64);
      ctx.restore();
    }
  }
  return canvas;
}

function marble(base, vein, { seed = 3, veins = 5 } = {}) {
  const body = fbmFields([3, 8, 20, 60], seed);
  const flow = fbmFields([2, 5], seed + 5);
  return paint(TILE, (x, y, u, v) => {
    const warp = (fbm(flow, u, v) - 0.5) * 1.4;
    const s = Math.sin((u + v * 0.6 + warp) * Math.PI * veins);
    const ridge = Math.pow(1 - Math.abs(s), 14);
    const grit = (fbm(body, u, v) - 0.5) * 0.16;
    return mix(base, vein, THREE.MathUtils.clamp(ridge + grit + 0.04, 0, 1));
  });
}

function speckle(base, fleck, { seed = 21, density = 90 } = {}) {
  const fine = fbmFields([density, density * 2], seed);
  const broad = fbmFields([6, 14], seed + 2);
  return paint(TILE, (x, y, u, v) => {
    const n = fbm(fine, u, v);
    const shade = (fbm(broad, u, v) - 0.5) * 0.25;
    const t = THREE.MathUtils.clamp((n - 0.45) * 2.4 + shade + 0.35, 0, 1);
    return mix(base, fleck, t);
  });
}

function plaster(base, { seed = 31, contrast = 0.22 } = {}) {
  const fields = fbmFields([8, 24, 64], seed);
  const dark = new THREE.Color(base).multiplyScalar(0.82).getStyle();
  const light = new THREE.Color(base).multiplyScalar(1.12).getStyle();
  return paint(TILE, (x, y, u, v) => {
    const n = fbm(fields, u, v);
    return mix(dark, light, THREE.MathUtils.clamp(0.5 + (n - 0.5) * (1 + contrast * 4), 0, 1));
  });
}

function weave(warpColor, weftColor, { threads = 64, seed = 41 } = {}) {
  const fuzz = fbmFields([threads * 2, threads * 4], seed);
  return paint(TILE, (x, y, u, v) => {
    const cu = Math.floor(u * threads);
    const cv = Math.floor(v * threads);
    const over = (cu + cv) % 2 === 0;
    const along = over ? (v * threads) % 1 : (u * threads) % 1;
    const shade = 0.72 + 0.28 * Math.sin(along * Math.PI);      // thread roundness
    const noise = (fbm(fuzz, u, v) - 0.5) * 0.18;
    const base = over ? warpColor : weftColor;
    return new THREE.Color(base).multiplyScalar(shade + noise).getStyle();
  });
}

function stripes(a, b, { count = 8, soft = 0.02, seed = 51 } = {}) {
  const texture = fbmFields([40, 120], seed);
  return paint(TILE, (x, y, u, v) => {
    const phase = (u * count) % 1;
    const edge = Math.min(phase, 1 - phase);
    const t = THREE.MathUtils.smoothstep(edge, 0, soft);
    const grain = (fbm(texture, u, v) - 0.5) * 0.08;
    return mix(a, b, THREE.MathUtils.clamp(t + grain, 0, 1));
  });
}

function damask(base, motif, { cells = 3, seed = 61 } = {}) {
  const canvas = newCanvas();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);

  const s = TILE / cells;
  const rnd = mulberry32(seed);
  ctx.fillStyle = motif;
  ctx.globalAlpha = 0.85;

  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const cx = i * s + (j % 2 ? s / 2 : 0);
      const cy = j * s;
      ctx.save();
      ctx.translate(cx, cy);
      // a simple four-petal rosette
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.2, s * 0.09, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.07 * (0.8 + rnd() * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function tiles(face, grout, { cols = 4, rows = 8, gap = 0.035, offset = 0.5, seed = 71 } = {}) {
  const fields = fbmFields([20, 60], seed);
  return paint(TILE, (x, y, u, v) => {
    const row = Math.floor(v * rows);
    const uu = (u + (row % 2 ? offset : 0)) % 1;
    const fx = (uu * cols) % 1;
    const fy = (v * rows) % 1;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    if (edge < gap) return grout;
    const shade = (fbm(fields, u, v) - 0.5) * 0.1;
    const bevel = THREE.MathUtils.smoothstep(edge, gap, gap + 0.05) * 0.12;
    return new THREE.Color(face).multiplyScalar(0.94 + shade + bevel).getStyle();
  });
}

function brushed(base, { seed = 81 } = {}) {
  const fields = fbmFields([256, 512], seed);
  const broad = fbmFields([4, 10], seed + 1);
  return paint(TILE, (x, y, u, v) => {
    const streak = fbm(fields, u, v * 0.02);
    const sheen = (fbm(broad, u, v) - 0.5) * 0.12;
    return new THREE.Color(base).multiplyScalar(0.86 + streak * 0.28 + sheen).getStyle();
  });
}

function flat(color) {
  const canvas = newCanvas(8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  return canvas;
}

/* ------------------------------------------------------------- library --- */

export const CATEGORIES = ['Wood', 'Stone & tile', 'Fabric', 'Wallpaper', 'Metal', 'Paint'];

/**
 * size  - default physical size of one texture tile, in metres
 * bump  - normal-map strength (0 disables the normal map)
 */
export const LIBRARY = [
  // -- Wood
  { id: 'oak', name: 'Oak', category: 'Wood', size: 1.4, roughness: 0.62, metalness: 0, bump: 1.4,
    draw: () => woodGrain('#d8b483', '#a87f4e', { planks: 4, seed: 7 }) },
  { id: 'walnut', name: 'Walnut', category: 'Wood', size: 1.4, roughness: 0.5, metalness: 0, bump: 1.4,
    draw: () => woodGrain('#8a5a38', '#3f2517', { planks: 4, seed: 13, ringiness: 20 }) },
  { id: 'ash-white', name: 'White ash', category: 'Wood', size: 1.4, roughness: 0.66, metalness: 0, bump: 1.2,
    draw: () => woodGrain('#ece0cf', '#c4ab8c', { planks: 5, seed: 19 }) },
  { id: 'parquet', name: 'Parquet', category: 'Wood', size: 1.0, roughness: 0.45, metalness: 0, bump: 1.8,
    draw: () => herringbone('#c99b62', '#7d4f28', { blocks: 6 }) },
  { id: 'bamboo', name: 'Bamboo', category: 'Wood', size: 1.1, roughness: 0.58, metalness: 0, bump: 1.1,
    draw: () => woodGrain('#dcc191', '#b2915d', { planks: 8, seed: 23, ringiness: 60 }) },

  // -- Stone & tile
  { id: 'carrara', name: 'Carrara', category: 'Stone & tile', size: 2.0, roughness: 0.22, metalness: 0, bump: 0.5,
    draw: () => marble('#f2f2ee', '#8e9299', { veins: 4 }) },
  { id: 'marquina', name: 'Black marble', category: 'Stone & tile', size: 2.0, roughness: 0.24, metalness: 0, bump: 0.5,
    draw: () => marble('#1e2024', '#c7ccd2', { veins: 5, seed: 9 }) },
  { id: 'granite', name: 'Granite', category: 'Stone & tile', size: 1.2, roughness: 0.4, metalness: 0, bump: 1.1,
    draw: () => speckle('#4a4d52', '#c6c9ce', { density: 110 }) },
  { id: 'terrazzo', name: 'Terrazzo', category: 'Stone & tile', size: 1.4, roughness: 0.35, metalness: 0, bump: 0.9,
    draw: () => speckle('#e8e4dc', '#8d8377', { density: 42, seed: 33 }) },
  { id: 'concrete', name: 'Concrete', category: 'Stone & tile', size: 2.4, roughness: 0.88, metalness: 0, bump: 1.6,
    draw: () => plaster('#9c9a96', { contrast: 0.3 }) },
  { id: 'subway', name: 'Subway tile', category: 'Stone & tile', size: 1.2, roughness: 0.2, metalness: 0, bump: 2.6,
    draw: () => tiles('#f4f2ed', '#b9b4ab', { cols: 4, rows: 8 }) },
  { id: 'mosaic', name: 'Mosaic', category: 'Stone & tile', size: 0.6, roughness: 0.28, metalness: 0, bump: 2.4,
    draw: () => tiles('#7fa7ad', '#e6e3dc', { cols: 8, rows: 8, offset: 0, gap: 0.06 }) },

  // -- Fabric
  { id: 'linen', name: 'Linen', category: 'Fabric', size: 0.8, roughness: 0.95, metalness: 0, bump: 1.8,
    draw: () => weave('#ded5c4', '#c9bfa9', { threads: 56 }) },
  { id: 'linen-blue', name: 'Blue linen', category: 'Fabric', size: 0.8, roughness: 0.95, metalness: 0, bump: 1.8,
    draw: () => weave('#5d7791', '#4a6178', { threads: 56, seed: 47 }) },
  { id: 'canvas', name: 'Canvas', category: 'Fabric', size: 1.0, roughness: 0.98, metalness: 0, bump: 2.2,
    draw: () => weave('#b9ad93', '#9d9179', { threads: 34, seed: 53 }) },
  { id: 'felt', name: 'Felt', category: 'Fabric', size: 1.2, roughness: 1, metalness: 0, bump: 1.2,
    draw: () => plaster('#6f6a66', { seed: 57, contrast: 0.12 }) },

  // -- Wallpaper
  { id: 'wp-plain', name: 'Plain', category: 'Wallpaper', size: 2.0, roughness: 0.9, metalness: 0, bump: 0.8,
    draw: () => plaster('#e9e6df', { seed: 63, contrast: 0.08 }) },
  { id: 'wp-stripe', name: 'Stripe', category: 'Wallpaper', size: 1.6, roughness: 0.88, metalness: 0, bump: 0.5,
    draw: () => stripes('#eceae4', '#c3cfd6', { count: 8 }) },
  { id: 'wp-stripe-wide', name: 'Wide stripe', category: 'Wallpaper', size: 2.2, roughness: 0.88, metalness: 0, bump: 0.5,
    draw: () => stripes('#f2efe8', '#8ea3a8', { count: 3, soft: 0.01 }) },
  { id: 'wp-damask', name: 'Damask', category: 'Wallpaper', size: 1.4, roughness: 0.85, metalness: 0, bump: 0.9,
    draw: () => damask('#2c3a4a', '#9fb0c0', { cells: 3 }) },
  { id: 'wp-botanical', name: 'Botanical', category: 'Wallpaper', size: 1.6, roughness: 0.85, metalness: 0, bump: 0.9,
    draw: () => damask('#e7e3d8', '#7c8f6a', { cells: 4, seed: 67 }) },

  // -- Metal
  { id: 'steel', name: 'Brushed steel', category: 'Metal', size: 1.2, roughness: 0.32, metalness: 0.92, bump: 0.7,
    draw: () => brushed('#b6bcc3') },
  { id: 'brass', name: 'Brass', category: 'Metal', size: 1.2, roughness: 0.3, metalness: 0.95, bump: 0.6,
    draw: () => brushed('#c9a44c', { seed: 87 }) },
  { id: 'black-steel', name: 'Black steel', category: 'Metal', size: 1.2, roughness: 0.42, metalness: 0.85, bump: 0.7,
    draw: () => brushed('#3a3d42', { seed: 91 }) },

  // -- Paint
  { id: 'paint-white', name: 'White', category: 'Paint', size: 1, roughness: 0.55, metalness: 0, bump: 0,
    draw: () => flat('#f4f3f0') },
  { id: 'paint-grey', name: 'Dust grey', category: 'Paint', size: 1, roughness: 0.55, metalness: 0, bump: 0,
    draw: () => flat('#9ba0a4') },
  { id: 'paint-sage', name: 'Sage', category: 'Paint', size: 1, roughness: 0.55, metalness: 0, bump: 0,
    draw: () => flat('#8e9c85') },
  { id: 'paint-navy', name: 'Navy', category: 'Paint', size: 1, roughness: 0.5, metalness: 0, bump: 0,
    draw: () => flat('#2b3d54') },
  { id: 'paint-clay', name: 'Clay', category: 'Paint', size: 1, roughness: 0.6, metalness: 0, bump: 0,
    draw: () => flat('#b08268') },
  { id: 'paint-black', name: 'Graphite', category: 'Paint', size: 1, roughness: 0.48, metalness: 0, bump: 0,
    draw: () => flat('#2a2d31') }
];

/**
 * Photographic materials. `url` is a 1024px colour map fetched only when the
 * material is first used; `thumb` is a 128px preview for the swatch grid, so
 * browsing the library costs a few KB rather than a few MB. `size` is the real
 * width the image covers, in metres.
 */
const PHOTO = [
  // -- Wood
  ['coated-pine',     'Coated pine',   'Wood',         'wood/coated-pine',     2.0, 0.55, 0, 0.7],
  ['hinoki-planks',   'Hinoki planks', 'Wood',         'wood/hinoki-planks',   2.0, 0.62, 0, 0.9],
  ['walnut-veneer',   'Walnut veneer', 'Wood',         'wood/walnut-veneer',   1.6, 0.45, 0, 0.5],

  // -- Stone & tile
  ['marble-photo',    'Marble',        'Stone & tile', 'stone/marble',         2.0, 0.22, 0, 0.25],
  ['tiles-photo',     'Tiles',         'Stone & tile', 'stone/tiles',          1.0, 0.30, 0, 1.0],
  ['concrete-photo',  'Concrete wall', 'Stone & tile', 'stone/concrete-wall',  3.0, 0.88, 0, 0.8],
  ['plaster-damaged', 'Aged plaster',  'Stone & tile', 'stone/damaged-plaster',3.0, 0.92, 0, 0.8],
  ['plaster-red',     'Red plaster',   'Stone & tile', 'stone/red-plaster',    3.0, 0.90, 0, 0.8],
  ['linoleum',        'Linoleum',      'Stone & tile', 'stone/linoleum',       2.0, 0.55, 0, 0.4],

  // -- Fabric
  ['velvet',          'Velvet',        'Fabric',       'fabric/velvet',        1.5, 0.95, 0, 0.6],
  ['faux-fur',        'Faux fur',      'Fabric',       'fabric/faux-fur',      1.2, 1.00, 0, 1.2],

  // -- Wallpaper
  ['blue-plaster',    'Blue plaster',  'Wallpaper',    'wallpaper/blue-plaster', 3.0, 0.90, 0, 0.6],
  ['terlenka',        'Terlenka',      'Wallpaper',    'wallpaper/terlenka',     1.5, 0.88, 0, 0.7]
].map(([id, name, category, path, size, roughness, metalness, bump]) => ({
  id, name, category, size, roughness, metalness, bump,
  url: `./assets/textures/${path}.jpg`,
  thumb: `./assets/textures/${path}.thumb.jpg`
}));

// the tiles came with a displacement map, so they get a real normal map
PHOTO.find((d) => d.id === 'tiles-photo').normalUrl = './assets/textures/stone/tiles.nrm.jpg';

LIBRARY.unshift(...PHOTO);

export const byId = (id) => LIBRARY.find((d) => d.id === id);

/* ------------------------------------------------------------ textures --- */

const cache = new Map();

/** Build (once) and cache the colour + normal canvas pair for a definition. */
function canvasesFor(def) {
  if (!cache.has(def.id)) {
    const colour = def.draw();
    cache.set(def.id, {
      colour,
      normal: def.bump > 0 ? normalFromCanvas(colour, def.bump) : null
    });
  }
  return cache.get(def.id);
}

/** Small data URL for the swatch grid. */
export function swatchUrl(def) {
  if (def.thumb) return def.thumb;          // photographic: a real thumbnail file
  const src = canvasesFor(def).colour;
  const c = newCanvas(64);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, 64, 64);
  return c.toDataURL('image/png');
}

THREE.Cache.enabled = true;               // fetch each texture file once
const textureLoader = new THREE.TextureLoader();

function shapeTexture(t, maxAniso, srgb) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.center.set(0.5, 0.5);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTexture(canvas, maxAniso, srgb) {
  return shapeTexture(new THREE.CanvasTexture(canvas), maxAniso, srgb);
}

const normalCache = new Map();

/** Downscale a photo, turn its luminance into relief, and cache the result. */
async function deriveNormal(def, maxAniso) {
  if (normalCache.has(def.id)) return normalCache.get(def.id);

  const promise = (async () => {
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = def.url;
      });
      const size = 512;                       // relief needs far less detail
      const flat = newCanvas(size);
      flat.getContext('2d').drawImage(image, 0, 0, size, size);
      return makeTexture(normalFromCanvas(flat, def.bump), maxAniso, false);
    } catch {
      return null;
    }
  })();

  normalCache.set(def.id, promise);
  return promise;
}

/**
 * @param {object} def     library entry, or a custom {id,name,image} from an upload
 * @param {object} params  { size, rotation, tint, roughness, metalness, unitsPerMetre }
 */
export function buildMaterial(def, params, maxAniso = 8) {
  const { size, rotation, tint, roughness, metalness, unitsPerMetre } = params;

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint ?? '#ffffff'),
    roughness: roughness ?? def.roughness ?? 0.6,
    metalness: metalness ?? def.metalness ?? 0,
    side: THREE.FrontSide
  });

  // UVs are in model units, so one tile spans `size` metres of real surface.
  const tileInModelUnits = Math.max(size, 0.001) * unitsPerMetre;
  const repeat = 1 / tileInModelUnits;
  const radians = THREE.MathUtils.degToRad(rotation ?? 0);

  // Photographic entries stream their image in; the file is only fetched the
  // first time that material is actually used.
  if (def.url) {
    material.map = shapeTexture(textureLoader.load(def.url), maxAniso, true);
    material.map.repeat.setScalar(repeat);
    material.map.rotation = radians;

    if (def.normalUrl) {
      material.normalMap = shapeTexture(textureLoader.load(def.normalUrl), maxAniso, false);
      material.normalMap.repeat.copy(material.map.repeat);
      material.normalMap.rotation = radians;
      material.normalScale.set(0.9, 0.9);
    } else if (def.bump > 0) {
      // No height map supplied — derive relief from the photo's luminance once
      // it arrives, then mirror whatever transform the colour map now carries.
      deriveNormal(def, maxAniso).then((normal) => {
        if (!normal) return;
        material.normalMap = normal;
        material.normalMap.repeat.copy(material.map.repeat);
        material.normalMap.rotation = material.map.rotation;
        material.normalScale.set(0.55, 0.55);
        material.needsUpdate = true;
      });
    }

    material.userData.libraryId = def.id;
    return material;
  }

  const source = def.image
    ? { colour: def.image, normal: null }
    : canvasesFor(def);

  material.map = makeTexture(source.colour, maxAniso, true);
  material.map.repeat.setScalar(repeat);
  material.map.rotation = radians;

  if (source.normal) {
    material.normalMap = makeTexture(source.normal, maxAniso, false);
    material.normalMap.repeat.setScalar(repeat);
    material.normalMap.rotation = radians;
    material.normalScale.set(0.7, 0.7);
  }

  material.userData.libraryId = def.id;
  return material;
}

/* ----------------------------------------------------------- projection -- */

/**
 * Replace a mesh's UVs with a box projection measured in model units, so that
 * "one tile = 1.4 m" is literally true no matter how the model was unwrapped.
 * The original geometry is kept so this can be undone.
 */
export function projectUV(mesh, root) {
  if (!mesh.isMesh || !mesh.geometry) return false;

  const original = mesh.userData._sourceGeometry ?? mesh.geometry;
  if (original.attributes.position.count > 300000) return false;   // too heavy

  mesh.userData._sourceGeometry = original;

  const geometry = original.index ? original.toNonIndexed() : original.clone();
  const position = geometry.attributes.position;

  // mesh-local -> root space, so neighbouring parts share one projection frame
  root.updateMatrixWorld(true);
  mesh.updateWorldMatrix(true, false);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    b.fromBufferAttribute(position, i + 1).applyMatrix4(toRoot);
    c.fromBufferAttribute(position, i + 2).applyMatrix4(toRoot);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);

    const nx = Math.abs(normal.x);
    const ny = Math.abs(normal.y);
    const nz = Math.abs(normal.z);

    // project onto the plane the triangle faces most directly
    let pick;
    if (nx >= ny && nx >= nz) pick = (p) => [p.z, p.y];
    else if (ny >= nx && ny >= nz) pick = (p) => [p.x, p.z];
    else pick = (p) => [p.x, p.y];

    for (const [k, p] of [[0, a], [1, b], [2, c]]) {
      const [u, v] = pick(p);
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = v;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  if (mesh.geometry !== original) mesh.geometry.dispose();
  mesh.geometry = geometry;
  return true;
}

export function restoreGeometry(mesh) {
  const original = mesh.userData._sourceGeometry;
  if (!original) return;
  if (mesh.geometry !== original) mesh.geometry.dispose();
  mesh.geometry = original;
  delete mesh.userData._sourceGeometry;
}

/* -------------------------------------------------------------- assign --- */

/** Apply a material to every mesh under `objects`, remembering what was there. */
export function assign(objects, material, root, { project = true } = {}) {
  let count = 0;
  for (const object of objects) {
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (mesh.userData._originalMaterial === undefined) {
        mesh.userData._originalMaterial = mesh.material;
      }
      if (project) projectUV(mesh, root);
      mesh.material = material;
      count++;
    });
  }
  return count;
}

export function restore(objects) {
  let count = 0;
  for (const object of objects) {
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (mesh.userData._originalMaterial !== undefined) {
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
        count++;
      }
      restoreGeometry(mesh);
    });
  }
  return count;
}

/** Load a user-supplied image file as a custom library entry. */
export async function customFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = newCanvas(Math.min(1024, Math.max(bitmap.width, bitmap.height)));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return {
    id: `custom:${file.name}`,
    name: file.name.replace(/\.[^.]+$/, ''),
    category: 'Custom',
    size: 1,
    roughness: 0.7,
    metalness: 0,
    bump: 0,
    image: canvas
  };
}
