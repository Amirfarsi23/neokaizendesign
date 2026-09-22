import * as THREE from 'three';

/**
 * Kitchen construction: hollow carcasses, shelves, drawer boxes with sides and
 * bases, an oven and a fridge — assembled into a demonstration kitchen, and
 * offered piece by piece through `PARTS` for adding to an imported model.
 *
 * Every door and drawer carries a `demoJoint` tag describing how it should
 * move, so the kitchen arrives already rigged — open it in Play mode and
 * everything works. That is also a worked example of the data a real importer
 * would need to produce.
 */

const T = 0.018;          // panel thickness
const PLINTH = 0.15;
const CARCASS_H = 0.72;
const DEPTH = 0.6;
const TOP_Y = PLINTH + CARCASS_H;      // 0.87
const TOP_T = 0.03;
const Z_BACK = -0.3;
const GAP = 0.003;
const FRONT_T = 0.018;

const WALL_Y = 1.45;
const WALL_H = 0.7;
const WALL_D = 0.35;

let M;

export function buildDemoKitchen() {
  M = materials();

  const kitchen = new THREE.Group();
  kitchen.name = 'Demo kitchen';

  kitchen.add(backWall(), worktop(), splashback());

  kitchen.add(baseDoorUnit(-1.55, 0.6, 'left'));
  kitchen.add(drawerUnit(-0.90, 0.6));
  kitchen.add(ovenUnit(-0.25, 0.6));
  kitchen.add(baseDoubleUnit(0.40, 0.6));

  kitchen.add(wallUnit(-1.55, 0.6, 'left'));
  kitchen.add(wallUnit(-0.90, 0.6, 'right'));
  kitchen.add(wallUnit(0.40, 0.6, 'left'));

  kitchen.add(fridge(1.22));

  kitchen.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return kitchen;
}

/* ------------------------------------------------------------ materials -- */

function materials() {
  const std = (color, roughness, metalness = 0.03) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    carcass: std(0xd9d3c9, 0.85),
    inside: std(0xeee9e0, 0.88),          // lighter, so an open cabinet reads
    front: std(0xf2f0ec, 0.5),
    accent: std(0x35506b, 0.45),
    worktop: std(0x2f3338, 0.35, 0.15),
    wall: std(0xe9e7e2, 0.95),
    handle: std(0x9aa3ad, 0.28, 0.85),
    steel: std(0xc3c9d0, 0.3, 0.8),
    ovenGlass: std(0x14171b, 0.15, 0.4),
    burner: std(0x1b1e22, 0.4, 0.3),
    shelf: std(0xe4ded4, 0.8)
  };
}

/* --------------------------------------------------------------- pieces -- */

function box(w, h, d, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  return mesh;
}

/**
 * A five-sided carcass — back, two sides, top and bottom — so that opening the
 * door reveals an interior instead of a solid block.
 */
function carcass(w, h, d, { shelves = 1, name = 'Carcass' } = {}) {
  const group = new THREE.Group();
  group.name = name;

  const side = (sign) => {
    const panel = box(T, h, d, M.carcass, `Side ${sign < 0 ? 'left' : 'right'}`);
    panel.position.set(sign * (w / 2 - T / 2), 0, 0);
    return panel;
  };
  const deck = (y, label) => {
    const panel = box(w - 2 * T, T, d, M.carcass, label);
    panel.position.set(0, y, 0);
    return panel;
  };

  group.add(side(-1), side(1));
  group.add(deck(-h / 2 + T / 2, 'Bottom'), deck(h / 2 - T / 2, 'Top'));

  const back = box(w - 2 * T, h - 2 * T, T, M.inside, 'Back');
  back.position.set(0, 0, -d / 2 + T / 2);
  group.add(back);

  for (let i = 1; i <= shelves; i++) {
    const shelf = box(w - 2 * T - 0.004, T * 0.8, d - 0.03, M.shelf, `Shelf ${i}`);
    shelf.position.set(0, -h / 2 + (h * i) / (shelves + 1), 0.01);
    group.add(shelf);
  }
  return group;
}

/** A drawer that is an actual box: front, two sides, a back and a base. */
function drawerBox(w, h, d, name) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.selectionRoot = true;

  const front = box(w, h, FRONT_T, M.front, `${name} front`);
  front.position.set(0, 0, d / 2 - FRONT_T / 2);
  group.add(front);

  const inner = w - 2 * T;
  for (const sign of [-1, 1]) {
    const side = box(T, h * 0.8, d - FRONT_T, M.inside, `${name} side`);
    side.position.set(sign * (w / 2 - T / 2), -h * 0.05, -FRONT_T / 2);
    group.add(side);
  }

  const base = box(inner, T * 0.7, d - FRONT_T, M.inside, `${name} base`);
  base.position.set(0, -h * 0.45 + T, -FRONT_T / 2);
  group.add(base);

  const back = box(inner, h * 0.8, T, M.inside, `${name} back`);
  back.position.set(0, -h * 0.05, -d / 2 + T / 2);
  group.add(back);

  return group;
}

function handle(length, horizontal, name = 'Handle') {
  const mesh = box(
    horizontal ? length : 0.016,
    horizontal ? 0.016 : length,
    0.024, M.handle, name
  );
  return mesh;
}

/* ---------------------------------------------------------------- units -- */

function backWall() {
  const wall = box(4.4, 2.7, 0.05, M.wall, 'Wall');
  wall.position.set(-0.2, 1.35, Z_BACK - 0.025);
  return wall;
}

function worktop() {
  const top = box(2.55, TOP_T, DEPTH + 0.02, M.worktop, 'Worktop');
  top.position.set(-0.575, TOP_Y + TOP_T / 2, Z_BACK + (DEPTH + 0.02) / 2);
  return top;
}

function splashback() {
  const s = box(2.55, 0.5, 0.02, M.wall, 'Splashback');
  s.position.set(-0.575, TOP_Y + TOP_T + 0.25, Z_BACK + 0.01);
  return s;
}

function plinth(x, w) {
  const p = box(w, PLINTH, DEPTH - 0.08, M.worktop, 'Plinth');
  p.position.set(x, PLINTH / 2, Z_BACK + (DEPTH - 0.08) / 2 + 0.04);
  return p;
}

const frontZ = Z_BACK + DEPTH - FRONT_T / 2;

/** Door leaf + handle, tagged so it arrives already hinged. */
function doorLeaf({ w, h, x, y, z, side, material, name, max = 100 }) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.selectionRoot = true;

  const leaf = box(w, h, FRONT_T, material, name);
  leaf.position.set(x, y, z);
  group.add(leaf);

  // handle on the opening edge
  const grip = handle(Math.min(h * 0.4, 0.26), false);
  grip.position.set(x - side * (w / 2 - 0.06), y, z + 0.02);
  group.add(grip);

  // hinge on the far edge; sign chosen so it swings out of the cabinet
  group.userData.demoJoint = {
    type: 'hinge',
    axis: side < 0 ? [0, -1, 0] : [0, 1, 0],
    point: [x + side * (w / 2), y, z],
    min: 0,
    max
  };
  return group;
}

function baseDoorUnit(x, w, side) {
  const unit = new THREE.Group();
  unit.name = `Base unit ${x.toFixed(2)}`;
  unit.add(carcass(w, CARCASS_H, DEPTH - FRONT_T));
  unit.children[0].position.set(x, PLINTH + CARCASS_H / 2, Z_BACK + (DEPTH - FRONT_T) / 2);
  unit.add(plinth(x, w));
  unit.add(doorLeaf({
    w: w - GAP * 2, h: CARCASS_H - GAP * 2,
    x, y: PLINTH + CARCASS_H / 2, z: frontZ,
    side: side === 'left' ? -1 : 1,
    material: M.front, name: `Base door ${side}`
  }));
  return unit;
}

function baseDoubleUnit(x, w) {
  const unit = new THREE.Group();
  unit.name = `Base unit ${x.toFixed(2)}`;
  const body = carcass(w, CARCASS_H, DEPTH - FRONT_T);
  body.position.set(x, PLINTH + CARCASS_H / 2, Z_BACK + (DEPTH - FRONT_T) / 2);
  unit.add(body, plinth(x, w));

  const dw = (w - GAP * 3) / 2;
  for (const side of [-1, 1]) {
    unit.add(doorLeaf({
      w: dw, h: CARCASS_H - GAP * 2,
      x: x + side * (dw / 2 + GAP / 2), y: PLINTH + CARCASS_H / 2, z: frontZ,
      side,
      material: M.accent,
      name: `Sink door ${side < 0 ? 'left' : 'right'}`
    }));
  }
  return unit;
}

function drawerUnit(x, w) {
  const unit = new THREE.Group();
  unit.name = `Drawer unit ${x.toFixed(2)}`;
  const body = carcass(w, CARCASS_H, DEPTH - FRONT_T, { shelves: 0 });
  body.position.set(x, PLINTH + CARCASS_H / 2, Z_BACK + (DEPTH - FRONT_T) / 2);
  unit.add(body, plinth(x, w));

  const n = 3;
  const h = (CARCASS_H - GAP * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const y = PLINTH + GAP + h / 2 + i * (h + GAP);
    const drawer = drawerBox(w - GAP * 2, h, DEPTH - 0.04, `Drawer ${n - i}`);
    drawer.position.set(x, y, Z_BACK + (DEPTH - 0.04) / 2);
    const grip = handle(w * 0.4, true);
    grip.position.set(0, h / 2 - 0.07, (DEPTH - 0.04) / 2 + 0.01);
    drawer.add(grip);
    drawer.userData.demoJoint = {
      type: 'slide', axis: [0, 0, 1], point: [x, y, frontZ], min: 0, max: 0.45
    };
    unit.add(drawer);
  }
  return unit;
}

/** Built-in oven: a dark cavity with a door that drops down from its base. */
function ovenUnit(x, w) {
  const unit = new THREE.Group();
  unit.name = 'Oven housing';
  unit.add(plinth(x, w));

  const cavityH = 0.55;
  const cavityY = PLINTH + cavityH / 2 + 0.06;

  const cavity = carcass(w - 0.04, cavityH, DEPTH - 0.08, { shelves: 2, name: 'Oven cavity' });
  cavity.position.set(x, cavityY, Z_BACK + (DEPTH - 0.08) / 2);
  cavity.traverse((o) => { if (o.isMesh) o.material = M.ovenGlass; });
  unit.add(cavity);

  const surround = box(w, CARCASS_H - cavityH - 0.06, DEPTH - FRONT_T, M.carcass, 'Oven surround');
  surround.position.set(x, PLINTH + cavityH + 0.06 + (CARCASS_H - cavityH - 0.06) / 2,
    Z_BACK + (DEPTH - FRONT_T) / 2);
  unit.add(surround);

  // the door: hinged along its bottom edge, so it falls forward
  const door = new THREE.Group();
  door.name = 'Oven door';
  door.userData.selectionRoot = true;

  const leaf = box(w - 0.02, cavityH, 0.03, M.ovenGlass, 'Oven door');
  leaf.position.set(x, cavityY, frontZ);
  door.add(leaf);

  const bar = handle(w * 0.75, true, 'Oven handle');
  bar.position.set(x, cavityY + cavityH / 2 - 0.05, frontZ + 0.03);
  door.add(bar);

  door.userData.demoJoint = {
    type: 'hinge', axis: [1, 0, 0],
    point: [x, cavityY - cavityH / 2, frontZ], min: 0, max: 90
  };
  unit.add(door);

  // hob above, on the worktop
  const hob = box(w - 0.06, 0.012, DEPTH - 0.14, M.ovenGlass, 'Hob');
  hob.position.set(x, TOP_Y + TOP_T + 0.006, Z_BACK + DEPTH / 2);
  unit.add(hob);

  for (const [bx, bz] of [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.11], [0.13, 0.11]]) {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.008, 24), M.burner
    );
    ring.name = 'Burner';
    ring.position.set(x + bx, TOP_Y + TOP_T + 0.014, Z_BACK + DEPTH / 2 + bz);
    unit.add(ring);
  }
  return unit;
}

function wallUnit(x, w, side) {
  const unit = new THREE.Group();
  unit.name = `Wall unit ${x.toFixed(2)}`;

  const body = carcass(w, WALL_H, WALL_D - FRONT_T, { shelves: 1 });
  body.position.set(x, WALL_Y + WALL_H / 2, Z_BACK + (WALL_D - FRONT_T) / 2);
  unit.add(body);

  unit.add(doorLeaf({
    w: w - GAP * 2, h: WALL_H - GAP * 2,
    x, y: WALL_Y + WALL_H / 2, z: Z_BACK + WALL_D - FRONT_T / 2,
    side: side === 'left' ? -1 : 1,
    material: M.front, name: `Wall door ${side}`, max: 105
  }));
  return unit;
}

/** Free-standing fridge: steel body, shelves inside, a door on the right. */
function fridge(x) {
  const unit = new THREE.Group();
  unit.name = 'Fridge';

  const w = 0.65;
  const h = 1.9;
  const d = 0.62;
  const y = h / 2;
  const z = Z_BACK + d / 2;

  const body = carcass(w, h, d - 0.04, { shelves: 4, name: 'Fridge carcass' });
  body.position.set(x, y, z);
  unit.add(body);

  // a drawer for the salad box, so the fridge is not just a hinge
  const bin = drawerBox(w - 0.06, 0.24, d - 0.12, 'Fridge drawer');
  bin.position.set(x, 0.28, z);
  bin.userData.demoJoint = {
    type: 'slide', axis: [0, 0, 1], point: [x, 0.28, z], min: 0, max: 0.3
  };
  unit.add(bin);

  const doorZ = Z_BACK + d - 0.015;
  const door = new THREE.Group();
  door.name = 'Fridge door';
  door.userData.selectionRoot = true;

  const leaf = box(w, h, 0.03, M.steel, 'Fridge door');
  leaf.position.set(x, y, doorZ);
  door.add(leaf);

  const bar = handle(0.9, false, 'Fridge handle');
  bar.position.set(x - w / 2 + 0.07, y + 0.15, doorZ + 0.03);
  door.add(bar);

  door.userData.demoJoint = {
    type: 'hinge', axis: [0, 1, 0], point: [x + w / 2, y, doorZ], min: 0, max: 115
  };
  unit.add(door);

  return unit;
}

/* -------------------------------------------------------------- library -- */

/**
 * The same construction, offered one piece at a time.
 *
 * An imported CAD kitchen is often just carcasses: no handles, no drawer
 * boxes, no appliances. These fill that in. Each piece is built at the origin
 * and keeps its `demoJoint` tags, so it arrives already able to open.
 */
export const PARTS = {
  base: { label: 'Cabinet', build: () => baseDoorUnit(0, 0.6, 'left') },
  drawers: { label: 'Drawers', build: () => drawerUnit(0, 0.6) },
  wall: { label: 'Wall unit', build: () => wallUnit(0, 0.6, 'left') },
  oven: { label: 'Stove', build: () => ovenUnit(0, 0.6) },
  fridge: { label: 'Fridge', build: () => fridge(0) },
  dishwasher: { label: 'Dishwasher', build: () => dishwasher(0, 0.6) },
  handle: { label: 'Handle', build: () => handle(0.3, true, 'Handle') }
};

/**
 * Build one library piece, standing on its own at the origin.
 *
 * @param {string} kind        a key of PARTS
 * @param {number} unitScale   model units per metre, so a millimetre-authored
 *                             kitchen gets a fridge of the right size
 */
export function buildPart(kind, unitScale = 1) {
  const part = PARTS[kind];
  if (!part) throw new Error(`Unknown part: ${kind}`);

  M = materials();                       // the builders share one palette
  const object = part.build();
  object.name = part.label;

  // Centre it on x and z and sit it on the ground, so it lands where the
  // viewer is looking rather than wherever it sat in the demo layout.
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  for (const child of object.children) {
    child.position.x -= centre.x;
    child.position.z -= centre.z;
    child.position.y -= box.min.y;
  }

  if (unitScale !== 1) object.scale.setScalar(unitScale);

  object.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return object;
}

/** A dishwasher: a panelled front on a hinge, with a pull-out basket. */
function dishwasher(x, w) {
  const unit = new THREE.Group();
  unit.name = 'Dishwasher';
  unit.add(plinth(x, w));

  const body = carcass(w - 0.02, CARCASS_H, DEPTH - 0.06, { shelves: 0, name: 'Dishwasher body' });
  body.position.set(x, PLINTH + CARCASS_H / 2, Z_BACK + (DEPTH - 0.06) / 2);
  unit.add(body);

  const basket = drawerBox(w - 0.09, 0.2, DEPTH - 0.16, 'Dishwasher basket');
  basket.position.set(x, PLINTH + 0.22, Z_BACK + (DEPTH - 0.16) / 2);
  basket.userData.demoJoint = {
    type: 'slide', axis: [0, 0, 1], point: [x, PLINTH + 0.22, Z_BACK], min: 0, max: 0.4
  };
  unit.add(basket);

  // the front drops forward from its bottom edge, like an oven door
  const frontZ = Z_BACK + DEPTH - FRONT_T / 2;
  const door = new THREE.Group();
  door.name = 'Dishwasher door';
  door.userData.selectionRoot = true;

  const leaf = box(w - GAP * 2, CARCASS_H - 0.02, FRONT_T, M.door, 'Dishwasher front');
  leaf.position.set(x, PLINTH + CARCASS_H / 2, frontZ);
  door.add(leaf);

  const grip = handle(w * 0.5, true, 'Dishwasher handle');
  grip.position.set(x, PLINTH + CARCASS_H - 0.06, frontZ + 0.02);
  door.add(grip);

  door.userData.demoJoint = {
    type: 'hinge', axis: [1, 0, 0], point: [x, PLINTH, frontZ], min: 0, max: 90
  };
  unit.add(door);

  return unit;
}
