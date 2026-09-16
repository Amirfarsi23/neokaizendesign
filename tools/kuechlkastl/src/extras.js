import * as THREE from 'three';
import { contentBounds } from './transforms.js';

/**
 * Objects added on top of the imported model — furniture dropped in from a
 * file, plus built-in floors, walls and ceilings.
 *
 * They are ordinary children of `root`, so selection, materials, the section
 * box, the transform handles and rigging all work on them with no special
 * cases. What they do carry is their own stable-id namespace, so a material or
 * a placement recorded against one cannot collide with the host model's ids.
 */
export class Extras {
  constructor(viewer) {
    this.viewer = viewer;
    this.items = [];
    this.counter = 0;
    this.onChange = () => {};
  }

  clear() {
    for (const item of [...this.items]) this.remove(item.object, { quiet: true });
    this.items = [];
    this.counter = 0;
    this.onChange();
  }

  /**
   * @param {THREE.Object3D} object
   * @param {string} name
   * @param {Map} sidIndex  the app's id -> object map, extended in place
   */
  add(object, name, sidIndex, { ground = true, at = null } = {}) {
    const id = `x${++this.counter}`;
    object.name = name;
    object.userData.selectionRoot = true;     // clicking any face picks the whole thing
    object.userData.extraId = id;

    this.viewer.root.add(object);
    this.viewer.root.updateMatrixWorld(true);

    if (ground) this._place(object, at);

    // its own id namespace, merged into the shared index
    for (const [path, node] of stableIds(object, id)) sidIndex.set(path, node);

    object.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    this.items.push({ id, object, name });
    this.onChange();
    return object;
  }

  /** Sit it on the floor, centred where the camera is looking. */
  _place(object, at) {
    const box = contentBounds(object);
    if (box.isEmpty()) return;

    const centre = box.getCenter(new THREE.Vector3());
    const target = at ?? this.viewer.controls.target;

    object.position.x += target.x - centre.x;
    object.position.z += target.z - centre.z;
    object.position.y += -box.min.y;
    object.updateMatrixWorld(true);
  }

  remove(object, { quiet = false } = {}) {
    const item = this.items.find((i) => i.object === object);
    if (!item) return false;

    object.parent?.remove(object);
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose();
    });

    this.items = this.items.filter((i) => i !== item);
    if (!quiet) this.onChange();
    return true;
  }

  /** Which added object (if any) this node belongs to. */
  owning(node) {
    for (let o = node; o; o = o.parent) {
      if (o.userData.extraId) return o;
    }
    return null;
  }

}

/* ----------------------------------------------------------- built-ins -- */

/**
 * Room surfaces sized from the model's own extents, so they land roughly right
 * instead of needing four numbers typed in first. Everything after that is the
 * transform handles' job.
 */
export function buildSurface(kind, bounds, unitScale = 1) {
  const size = span(bounds, unitScale);
  const thickness = 0.06 * unitScale;
  const wallHeight = Math.max(size.y, 2.5 * unitScale);

  const spec = {
    floor: { w: size.x * 1.4, h: thickness, d: size.z * 1.6, colour: 0x8a8681, name: 'Floor' },
    ceiling: { w: size.x * 1.4, h: thickness, d: size.z * 1.6, colour: 0xe6e3dd, name: 'Ceiling' },
    wall: { w: size.x * 1.4, h: wallHeight, d: thickness, colour: 0xdedad3, name: 'Wall' }
  }[kind];

  if (!spec) throw new Error(`Unknown surface: ${kind}`);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(spec.w, spec.h, spec.d),
    new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.9, metalness: 0 })
  );
  mesh.name = spec.name;

  const group = new THREE.Group();
  group.add(mesh);

  // Position relative to the model: floor under it, ceiling above, wall behind.
  const centre = bounds && !bounds.isEmpty()
    ? bounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();

  if (kind === 'ceiling') {
    mesh.position.set(0, wallHeight, 0);
  } else if (kind === 'wall') {
    mesh.position.set(0, wallHeight / 2, (bounds?.isEmpty() ? 0 : bounds.min.z - centre.z) - thickness);
  }
  group.userData.surfaceKind = kind;
  return group;
}

function span(bounds, unitScale) {
  if (!bounds || bounds.isEmpty()) {
    return new THREE.Vector3(4 * unitScale, 2.7 * unitScale, 4 * unitScale);
  }
  return bounds.getSize(new THREE.Vector3());
}

function stableIds(root, prefix) {
  const out = [];
  (function walk(o, path) {
    o.userData.sid = path;
    out.push([path, o]);
    o.children.forEach((c, i) => walk(c, `${path}.${i}`));
  })(root, prefix);
  return out;
}
