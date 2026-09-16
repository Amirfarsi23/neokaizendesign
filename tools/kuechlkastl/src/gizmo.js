import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Move / rotate / scale handles, shared by model parts and lights.
 *
 * Everything the gizmo touches is a "mount" — a Group that sits between the
 * scene root and the thing being moved. Keeping the user transform on its own
 * node means animation (a door swinging) and placement (where the cabinet is)
 * never overwrite each other.
 */
export class Gizmo {
  constructor(viewer) {
    this.viewer = viewer;
    this.onChange = () => {};
    this.onCommit = () => {};
    this.target = null;

    const controls = new TransformControls(viewer.camera, viewer.renderer.domElement);
    controls.setSize(0.8);
    this.controls = controls;

    // three r166+ separates the interactive controls from their helper object
    this.helper = typeof controls.getHelper === 'function' ? controls.getHelper() : controls;
    this.helper.visible = false;
    viewer.overlay.add(this.helper);      // overlay is hidden during capture

    controls.addEventListener('dragging-changed', (e) => {
      viewer.controls.enabled = !e.value;
      if (!e.value) this.onCommit();
    });
    controls.addEventListener('objectChange', () => this.onChange());

    this.setMode('translate');
    this.setSpace('world');
    this.setSnap(false);
  }

  /** True while the pointer is over or dragging a handle — suppress selection. */
  get busy() {
    return Boolean(this.controls.dragging || this.controls.axis);
  }

  get mode() { return this.controls.mode; }
  get space() { return this.controls.space; }
  get snapping() { return this._snap; }

  setMode(mode) {
    this.controls.setMode(mode);
    return mode;
  }

  setSpace(space) {
    this.controls.setSpace(space);
    return space;
  }

  /** Snap to 10 mm and 15°, scaled to the model's units. */
  setSnap(on, unitsPerMetre = 1) {
    this._snap = on;
    this.controls.setTranslationSnap(on ? 0.01 * unitsPerMetre : null);
    this.controls.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
    this.controls.setScaleSnap(on ? 0.05 : null);
    return on;
  }

  attach(object) {
    if (!object) return this.detach();
    this.target = object;
    this.controls.attach(object);
    this.helper.visible = true;
  }

  detach() {
    this.target = null;
    this.controls.detach();
    this.helper.visible = false;
  }

  setVisible(visible) {
    this.helper.visible = visible && Boolean(this.target);
    this.controls.enabled = visible;
  }
}
