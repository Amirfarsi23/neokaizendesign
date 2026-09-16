import * as THREE from 'three';

let nextId = 1;

/**
 * Give every node a position-stable id so a saved rig can be re-attached to the
 * same file later. Must be called once, right after load, before any pivots are
 * inserted into the hierarchy.
 */
export function assignStableIds(modelRoot) {
  const index = new Map();
  (function walk(o, path) {
    o.userData.sid = path;
    index.set(path, o);
    o.children.forEach((c, i) => walk(c, path ? `${path}.${i}` : String(i)));
  })(modelRoot, '');
  return index;
}

/** Rough guess at how many model units make up one metre. */
export function guessUnitsPerMetre(box) {
  const diagonal = box.getSize(new THREE.Vector3()).length();
  if (diagonal <= 60) return 1;     // metres
  if (diagonal <= 600) return 100;  // centimetres
  return 1000;                      // millimetres
}

/**
 * A single degree of freedom bound to a set of objects.
 *
 * Implementation: the objects are re-parented (world transform preserved) under
 * a pivot Group sitting at the hinge point. Because every pivot lives directly
 * under the identity `root`, world-space axes can be used as the pivot's local
 * axes without further conversion.
 */
export class Joint {
  constructor({ id, type, name, objects, origin, axis, min, max, value = 0 }) {
    this.id = id ?? `j${nextId++}`;
    this.type = type;                       // 'hinge' | 'slide'
    this.name = name;
    this.objects = objects;
    this.origin = origin.clone();
    this.axis = axis.clone().normalize();
    this.min = min;
    this.max = max;
    this.value = value;
    this.target = value;
    this.pivot = null;
    this.mount = null;
    this._restore = [];
    this._basePosition = new THREE.Vector3();
  }

  get isOpen() {
    return Math.abs(this.target - this.min) > Math.abs(this.target - this.max);
  }

  /**
   * Build   root -> mount -> pivot -> objects.
   *
   * `mount` carries the user's placement transform (the gizmo drives it) and
   * `pivot` carries the animation. Keeping them on separate nodes means moving
   * a cabinet never disturbs its hinge, and opening a door never undoes a move.
   */
  attachTo(root) {
    // The mount sits ON the hinge line, so the transform handles appear where
    // the part is rather than out at the scene origin.
    const mount = new THREE.Group();
    mount.name = `mount:${this.name}`;
    mount.userData.isMount = true;
    mount.userData.joint = this;
    mount.userData.rest = this.origin.toArray();
    mount.position.copy(this.origin);
    root.add(mount);

    const pivot = new THREE.Group();
    pivot.name = `pivot:${this.name}`;
    pivot.userData.joint = this;
    pivot.position.set(0, 0, 0);          // the mount already carries the origin
    mount.add(pivot);
    mount.updateMatrixWorld(true);

    for (const obj of this.objects) {
      this._restore.push({ object: obj, parent: obj.parent });
      pivot.attach(obj);                    // preserves world transform
    }

    this.mount = mount;
    this.pivot = pivot;
    this._basePosition.copy(pivot.position);
    this.apply();
    return pivot;
  }

  detach() {
    if (!this.pivot) return;
    this.value = this.target = this.min;
    this.apply();
    this.mount.updateMatrixWorld(true);
    for (const { object, parent } of this._restore) parent.attach(object);
    this.mount.parent?.remove(this.mount);
    this.pivot = null;
    this.mount = null;
    this._restore = [];
  }

  apply() {
    if (!this.pivot) return;
    if (this.type === 'hinge') {
      this.pivot.quaternion.setFromAxisAngle(this.axis, THREE.MathUtils.degToRad(this.value));
    } else {
      this.pivot.position.copy(this._basePosition).addScaledVector(this.axis, this.value);
    }
  }

  setValue(v) {
    this.value = THREE.MathUtils.clamp(v, Math.min(this.min, this.max), Math.max(this.min, this.max));
    this.target = this.value;
    this.apply();
  }

  setTarget(v) {
    this.target = THREE.MathUtils.clamp(v, Math.min(this.min, this.max), Math.max(this.min, this.max));
  }

  toggle() {
    this.setTarget(this.isOpen ? this.min : this.max);
  }

  flip() {
    this.axis.negate();
    this.apply();
  }

  /** @returns true while still animating */
  step(dt, speed = 7) {
    if (Math.abs(this.target - this.value) < 1e-4) {
      if (this.value !== this.target) { this.value = this.target; this.apply(); }
      return false;
    }
    const k = 1 - Math.exp(-dt * speed);
    this.value += (this.target - this.value) * k;
    this.apply();
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      sids: this.objects.map((o) => o.userData.sid).filter((s) => s !== undefined),
      origin: this.origin.toArray().map(round),
      axis: this.axis.toArray().map(round),
      min: round(this.min),
      max: round(this.max),
      value: round(this.value),
      mount: this.mount ? {
        position: this.mount.position.toArray().map(round),
        quaternion: this.mount.quaternion.toArray().map(round),
        scale: this.mount.scale.toArray().map(round)
      } : null
    };
  }
}

const round = (n) => Math.round(n * 1e6) / 1e6;

/** Owns all joints for the currently loaded model. */
export class Rig {
  constructor(root) {
    this.root = root;
    this.joints = [];
    this.unitsPerMetre = 1;
    this.onChange = () => {};
  }

  clear() {
    for (const j of [...this.joints]) j.detach();
    this.joints = [];
    this.onChange();
  }

  add(joint) {
    joint.attachTo(this.root);
    this.joints.push(joint);
    this.onChange();
    return joint;
  }

  remove(joint) {
    joint.detach();
    this.joints = this.joints.filter((j) => j !== joint);
    this.onChange();
  }

  /** Which objects are already claimed by a joint. */
  isRigged(object) {
    return this.joints.some((j) => j.objects.includes(object));
  }

  /** The node the gizmo should drive for this joint. */
  mountOf(joint) {
    return joint?.mount ?? null;
  }

  /** Find the joint an arbitrary descendant belongs to, if any. */
  jointAt(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData.joint) return o.userData.joint;
    }
    return null;
  }

  openAll() { for (const j of this.joints) j.setTarget(j.max); }
  closeAll() { for (const j of this.joints) j.setTarget(j.min); }

  /** @returns how many joints are still moving */
  update(dt) {
    let moving = 0;
    for (const j of this.joints) if (j.step(dt)) moving++;
    return moving;
  }

  toJSON(meta = {}) {
    return { format: 'kitchen-motion-rig', version: 1, ...meta, joints: this.joints.map((j) => j.toJSON()) };
  }

  /**
   * Rebuild joints from a saved rig. `index` maps stable id -> object, captured
   * at load time.
   */
  fromJSON(data, index) {
    if (data?.format !== 'kitchen-motion-rig') {
      throw new Error('Not a Kitchen Motion rig file.');
    }
    this.clear();
    let skipped = 0;
    for (const raw of data.joints ?? []) {
      const objects = (raw.sids ?? []).map((s) => index.get(s)).filter(Boolean);
      if (!objects.length) { skipped++; continue; }
      const joint = this.add(new Joint({
        id: raw.id,
        type: raw.type,
        name: raw.name,
        objects,
        origin: new THREE.Vector3().fromArray(raw.origin),
        axis: new THREE.Vector3().fromArray(raw.axis),
        min: raw.min,
        max: raw.max,
        value: raw.value ?? raw.min
      }));
      if (raw.mount && joint.mount) {
        joint.mount.position.fromArray(raw.mount.position);
        joint.mount.quaternion.fromArray(raw.mount.quaternion);
        joint.mount.scale.fromArray(raw.mount.scale);
        joint.mount.updateMatrixWorld(true);
      }
    }
    return { loaded: this.joints.length, skipped };
  }
}
