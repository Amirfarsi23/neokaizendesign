import * as THREE from 'three';

/**
 * Section box — a draggable cage that clips the model so you can work on one
 * cupboard, one run, one room, without hiding anything permanently.
 *
 * The box is stored in root-local coordinates and lives under `viewer.root`, so
 * it follows the model when the Scene tab reorients it. three.js clips in world
 * space, so the six planes are re-derived from the root matrix every frame —
 * cheaper than tracking every way the transform could change.
 */

const FACES = [
  { axis: 'x', sign: -1, colour: 0xff6b6b },
  { axis: 'x', sign: 1, colour: 0xff6b6b },
  { axis: 'y', sign: -1, colour: 0x7ed07e },
  { axis: 'y', sign: 1, colour: 0x7ed07e },
  { axis: 'z', sign: -1, colour: 0x6b9cff },
  { axis: 'z', sign: 1, colour: 0x6b9cff }
];

/** A face can never be pushed closer than this to its opposite. */
const MIN_THICKNESS = 0.02;

export class ClipBox {
  constructor(viewer) {
    this.viewer = viewer;
    this.active = false;
    this.onChange = () => {};

    this.box = new THREE.Box3();
    this.bounds = new THREE.Box3();          // the model extents we fit within
    this.planes = FACES.map(() => new THREE.Plane());
    this._local = FACES.map(() => new THREE.Plane());

    this.group = new THREE.Group();
    this.group.name = 'sectionBox';
    this.group.userData.persistent = true;
    this.group.userData.excludeFromBounds = true;
    this.group.visible = false;
    viewer.root.add(this.group);

    this.cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x4560e0, transparent: true, opacity: 0.85 })
    );
    this.group.add(this.cage);

    this.handles = FACES.map((face) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: face.colour, transparent: true, opacity: 0.55, depthTest: false
        })
      );
      mesh.renderOrder = 997;
      mesh.userData.face = face;
      this.group.add(mesh);
      return mesh;
    });

    this.drag = null;
  }

  /* ---------------------------------------------------------- lifecycle -- */

  enable(bounds) {
    if (bounds && !bounds.isEmpty()) {
      this.bounds.copy(bounds);
      if (this.box.isEmpty()) this.box.copy(bounds);
    }
    this.active = true;
    this.group.visible = true;
    this.refresh();
    this.onChange();
  }

  disable() {
    this.active = false;
    this.group.visible = false;
    this.drag = null;
    this.onChange();
  }

  /** Snap the box around a target box (a selection, or the whole model). */
  fitTo(box, padding = 0.05) {
    if (!box || box.isEmpty()) return;
    const pad = box.getSize(new THREE.Vector3()).length() * padding;
    this.box.copy(box).expandByScalar(Math.max(pad, MIN_THICKNESS));
    this.refresh();
    this.onChange();
  }

  reset() {
    if (!this.bounds.isEmpty()) this.box.copy(this.bounds);
    this.refresh();
    this.onChange();
  }

  /* ------------------------------------------------------------- planes -- */

  /** Rebuild the cage, handles and local planes after the box changes. */
  refresh() {
    if (this.box.isEmpty()) return;

    const size = this.box.getSize(new THREE.Vector3());
    const centre = this.box.getCenter(new THREE.Vector3());

    this.cage.scale.copy(size);
    this.cage.position.copy(centre);

    const handleSize = Math.max(Math.min(size.x, size.y, size.z) * 0.08, 1e-4);

    FACES.forEach((face, i) => {
      const value = face.sign < 0 ? this.box.min[face.axis] : this.box.max[face.axis];

      const mesh = this.handles[i];
      mesh.position.copy(centre);
      mesh.position[face.axis] = value;
      mesh.scale.set(handleSize, handleSize, handleSize);
      mesh.scale[face.axis] = handleSize * 0.35;

      // keep x >= min  ->  normal +1, constant -min
      // keep x <= max  ->  normal -1, constant +max
      const normal = new THREE.Vector3();
      normal[face.axis] = -face.sign;
      this._local[i].set(normal, face.sign * value);
    });

    this.updatePlanes();
  }

  /** Re-derive the world-space clipping planes from the root transform. */
  updatePlanes() {
    const matrix = this.viewer.root.matrixWorld;
    for (let i = 0; i < this.planes.length; i++) {
      this.planes[i].copy(this._local[i]).applyMatrix4(matrix);
    }
  }

  /** Is this world-space point inside the section? Used to filter picking. */
  containsWorldPoint(point) {
    if (!this.active) return true;
    return this.planes.every((p) => p.distanceToPoint(point) >= -1e-6);
  }

  /* -------------------------------------------------------------- drag -- */

  /** @returns the handle under the cursor, or null */
  hit(raycaster) {
    if (!this.active) return null;
    const hits = raycaster.intersectObjects(this.handles, false);
    return hits.length ? hits[0] : null;
  }

  beginDrag(hit) {
    const face = hit.object.userData.face;
    const root = this.viewer.root;
    root.updateMatrixWorld(true);

    // the axis this face slides along, in world space
    const axis = new THREE.Vector3();
    axis[face.axis] = 1;
    axis.transformDirection(root.matrixWorld).normalize();

    // a drag plane that contains the axis and faces the camera as squarely as
    // possible, so cursor movement maps predictably onto the slide
    const view = this.viewer.camera.getWorldDirection(new THREE.Vector3());
    const normal = new THREE.Vector3().crossVectors(axis, view).cross(axis);
    if (normal.lengthSq() < 1e-8) normal.copy(view).negate();
    normal.normalize();

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);

    this.drag = {
      face,
      axis,
      plane,
      start: hit.point.clone(),
      startValue: face.sign < 0 ? this.box.min[face.axis] : this.box.max[face.axis],
      // model units travelled per world unit, so a scaled model still tracks
      scale: 1 / (root.scale.x || 1)
    };
    return true;
  }

  updateDrag(raycaster) {
    if (!this.drag) return;
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(this.drag.plane, point)) return;

    const travel = point.sub(this.drag.start).dot(this.drag.axis) * this.drag.scale;
    const { face, startValue } = this.drag;

    let value = startValue + travel;
    if (face.sign < 0) {
      value = Math.min(value, this.box.max[face.axis] - MIN_THICKNESS);
      this.box.min[face.axis] = value;
    } else {
      value = Math.max(value, this.box.min[face.axis] + MIN_THICKNESS);
      this.box.max[face.axis] = value;
    }
    this.refresh();
  }

  endDrag() {
    const wasDragging = Boolean(this.drag);
    this.drag = null;
    if (wasDragging) this.onChange();
    return wasDragging;
  }

  get dragging() { return Boolean(this.drag); }

  /* ------------------------------------------------------ serialisation -- */

  toJSON() {
    if (this.box.isEmpty()) return null;
    return {
      active: this.active,
      min: this.box.min.toArray().map(round),
      max: this.box.max.toArray().map(round)
    };
  }

  fromJSON(data, bounds) {
    if (bounds && !bounds.isEmpty()) this.bounds.copy(bounds);
    if (!data) {
      this.box.makeEmpty();
      this.disable();
      return false;
    }
    this.box.min.fromArray(data.min);
    this.box.max.fromArray(data.max);
    if (data.active) this.enable();
    else { this.refresh(); this.disable(); }
    return data.active;
  }
}

const round = (n) => Math.round(n * 1e5) / 1e5;
