import * as THREE from 'three';

/**
 * Free mounts — per-element placement transforms for parts that have no motion.
 *
 * A mount is a Group under the scene root that wraps the selected objects with
 * their world transform preserved. The gizmo drives the mount, so the original
 * node transforms from the imported file are never touched and "reset" is a
 * one-liner.
 *
 * Rigged parts do not use these: their Joint already owns a mount.
 */
export class MountRegistry {
  constructor(root) {
    this.root = root;
    this.mounts = [];
  }

  /**
   * The OUTERMOST mount an object lives in. Outermost matters: a grouped door
   * sits inside its Joint's mount which sits inside the group's mount, and the
   * handles should move the group.
   */
  find(object) {
    let found = null;
    for (let o = object; o && o !== this.root; o = o.parent) {
      if (o.userData.isMount) found = o;
    }
    return found;
  }

  /** The mount belonging to the Joint this object is animated by, if any. */
  jointMountOf(object) {
    for (let o = object; o && o !== this.root; o = o.parent) {
      if (o.userData.joint?.mount) return o.userData.joint.mount;
    }
    return null;
  }

  /**
   * Get (or create) a mount wrapping `objects`. If they already share one it is
   * reused, so dragging one door of a pair you moved together moves both.
   */
  acquire(objects) {
    if (!objects.length) return null;

    const sids = objects.map((o) => o.userData.sid).filter((s) => s !== undefined);
    const existing = this.find(objects[0]);

    if (existing && objects.every((o) => this.find(o) === existing)) {
      // Reuse the wrapper only if it was built for this exact set, belongs to a
      // Joint, or has actually been moved. Otherwise selecting one part of a
      // pair you once multi-selected would silently drag both.
      const sameSet = existing.userData.sids?.length === sids.length
        && sids.every((s) => existing.userData.sids.includes(s));
      if (sameSet || !existing.userData.freeMount || !isAtRest(existing)) return existing;
      this.dissolveOne(existing);
    }

    // Wrap each object's outermost mount rather than the object itself. That
    // keeps a Joint's pivot intact — re-parenting a door out of its pivot would
    // silently kill the animation — and lets a group nest joint mounts inside
    // one group mount so everything moves together.
    const nodes = [];
    for (const object of objects) {
      const node = this.find(object) ?? object;
      if (!nodes.includes(node)) nodes.push(node);
    }
    if (nodes.length === 1 && nodes[0].userData.isMount) return nodes[0];

    // Park the mount at the selection's centre so the handles land on the part.
    const centre = centreOf(nodes, this.root);

    const mount = new THREE.Group();
    mount.name = `mount:${objects[0].name || 'part'}`;
    mount.userData.isMount = true;
    mount.userData.freeMount = true;
    mount.userData.rest = centre.toArray();
    mount.userData.sids = objects.map((o) => o.userData.sid).filter((s) => s !== undefined);
    mount.position.copy(centre);

    this.root.add(mount);
    this.root.updateMatrixWorld(true);
    // remember where each node came from so the mount can be unwrapped cleanly
    mount.userData.origins = nodes.map((n) => ({ node: n, parent: n.parent }));
    for (const node of nodes) mount.attach(node);         // preserves world transform

    this.mounts.push(mount);
    return mount;
  }

  /** Put a mount back where it started without unwrapping it. */
  reset(mount) {
    resetMount(mount);
  }

  /** Drop mounts that no longer contain anything (their parts got rigged). */
  prune() {
    for (const mount of [...this.mounts]) {
      if (mount.children.length) continue;
      mount.parent?.remove(mount);
      this.mounts = this.mounts.filter((m) => m !== mount);
    }
  }

  /**
   * Unwrap every mount, putting its contents back where they came from at their
   * original transforms. Used when restoring a snapshot — plain removal would
   * take the parts out of the scene with it.
   */
  dissolve() {
    // later-created mounts are the outer ones, so unwrap back to front
    for (const mount of [...this.mounts].reverse()) this.dissolveOne(mount);
    this.mounts = [];
  }

  /** Unwrap one mount, returning its contents to where they came from. */
  dissolveOne(mount) {
    const host = mount.parent;
    if (host) {
      resetMount(mount);
      mount.updateMatrixWorld(true);

      for (const { node, parent } of mount.userData.origins ?? []) {
        // the original parent may itself have been removed since
        if (node.parent === mount && parent && parent.parent) parent.attach(node);
      }
      // anything unaccounted for goes to the mount's own parent
      for (const child of [...mount.children]) host.attach(child);
      host.remove(mount);
    }
    this.mounts = this.mounts.filter((m) => m !== mount);
  }

  clear() {
    this.dissolve();
  }

  toJSON() {
    return this.mounts
      .filter((m) => m.children.length && !isAtRest(m))
      .map((m) => ({
        sids: m.userData.sids,
        ...transformToJSON(m)
      }));
  }

  fromJSON(list, index) {
    let applied = 0;
    for (const entry of list ?? []) {
      const objects = (entry.sids ?? []).map((s) => index.get(s)).filter(Boolean);
      if (!objects.length) continue;
      const mount = this.acquire(objects);
      applyTransformJSON(mount, entry);
      applied++;
    }
    return applied;
  }
}

/**
 * World bounds of the real model, ignoring helper geometry.
 *
 * `Box3.setFromObject` counts every descendant — including empty groups sitting
 * at the origin and the section-box cage — which silently dragged the automatic
 * grounding and camera framing off. Subtrees flagged `excludeFromBounds` are
 * skipped entirely.
 */
export function contentBounds(root, target = new THREE.Box3()) {
  target.makeEmpty();
  (function walk(object) {
    if (object.userData.excludeFromBounds) return;
    // a geometry that came back from a file can be malformed; one bad mesh
    // must not stop the bounds being measured
    if (object.isMesh && object.geometry?.isBufferGeometry) {
      try { target.expandByObject(object); } catch { /* skip this one */ }
    }
    for (const child of object.children) walk(child);
  })(root);
  return target;
}

/* ------------------------------------------------------------- helpers -- */

/** Where a mount sits when it has not been moved. */
export function restOf(object) {
  return new THREE.Vector3().fromArray(object.userData.rest ?? [0, 0, 0]);
}

export function isAtRest(object) {
  return object.position.distanceToSquared(restOf(object)) < 1e-12
    && Math.abs(object.quaternion.w - 1) < 1e-9
    && Math.abs(object.scale.x - 1) < 1e-9;
}

/** Send a mount (joint or free) back to its rest transform. */
export function resetMount(mount) {
  mount.position.copy(restOf(mount));
  mount.quaternion.identity();
  mount.scale.setScalar(1);
  mount.updateMatrixWorld(true);
}

/** Bounding-box centre of `objects`, expressed in `root` space. */
function centreOf(objects, root) {
  const box = new THREE.Box3();
  for (const object of objects) box.expandByObject(object);
  const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  root.updateMatrixWorld(true);
  return root.worldToLocal(centre);
}

export function transformToJSON(object) {
  return {
    position: object.position.toArray().map(round),
    quaternion: object.quaternion.toArray().map(round),
    scale: object.scale.toArray().map(round)
  };
}

export function applyTransformJSON(object, data) {
  if (!data) return;
  if (data.position) object.position.fromArray(data.position);
  if (data.quaternion) object.quaternion.fromArray(data.quaternion);
  if (data.scale) object.scale.fromArray(data.scale);
  object.updateMatrixWorld(true);
}

const round = (n) => Math.round(n * 1e6) / 1e6;
