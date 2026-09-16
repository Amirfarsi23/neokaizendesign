import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/**
 * WebXR: stand inside the kitchen and open the cabinets by hand.
 *
 * The camera lives inside a "player" rig so locomotion has something to move —
 * in XR the headset owns the camera's pose, so you move the world-relative rig
 * instead. The rig is also scaled by the model's units-per-metre, which is what
 * stops a millimetre-authored kitchen from making you 1.7 mm tall.
 */

const MOVE_SPEED = 1.6;        // metres per second
const SNAP_TURN = 30;          // degrees per flick
const DEADZONE = 0.18;

export class VR {
  /**
   * @param {object} ctx { onTrigger, getUnitScale, onStart, onEnd, hint }
   */
  constructor(viewer, ctx) {
    this.viewer = viewer;
    this.ctx = ctx;
    this.session = null;
    this.controllers = [];
    this._snapArmed = true;

    this._raycaster = new THREE.Raycaster();
    this._tempMatrix = new THREE.Matrix4();
    this._saved = null;

    viewer.renderer.xr.enabled = true;
  }

  /** Does this browser/device actually offer immersive VR? */
  static async supported() {
    return (await VR.diagnose()).ok;
  }

  /**
   * Why VR is or is not available. Each failure has a different fix, so the UI
   * reports the specific one rather than just greying a button out.
   *
   * @returns {Promise<{ok: boolean, code: string, reason: string}>}
   */
  static async diagnose() {
    if (!window.isSecureContext) {
      return {
        ok: false,
        code: 'insecure',
        reason: `WebXR only runs on a secure page. This one is ${location.origin}. `
          + 'Open it as https://, or put the headset on localhost with '
          + '"adb reverse tcp:5173 tcp:5173" — see the VR section of the README.'
      };
    }
    if (!navigator.xr) {
      return {
        ok: false,
        code: 'no-webxr',
        reason: 'This browser has no WebXR. Chrome, Edge or the headset\'s own '
          + 'browser will work; Safari and most embedded web views will not.'
      };
    }
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-vr');
      if (ok) return { ok: true, code: 'ready', reason: 'Ready' };
      return {
        ok: false,
        code: 'no-device',
        reason: 'No VR runtime is reporting a headset. Either open this page '
          + 'inside the headset\'s own browser, or connect the headset to this PC '
          + '(Quest Link / SteamVR / Windows Mixed Reality) before loading the page.'
      };
    } catch (err) {
      return { ok: false, code: 'error', reason: `WebXR check failed: ${err.message}` };
    }
  }

  /** Re-check when a headset is plugged in after the page loaded. */
  static onAvailabilityChange(fn) {
    navigator.xr?.addEventListener?.('devicechange', fn);
  }

  async enter() {
    if (this.session) return;

    // Runtimes disagree about which features they will grant, and asking for one
    // they dislike fails the whole request with "session configuration is not
    // supported". Try richest first, then fall back to the bare minimum.
    const attempts = [
      { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] },
      { optionalFeatures: ['local-floor', 'hand-tracking'] },
      {}
    ];

    let session = null;
    let lastError = null;
    for (const init of attempts) {
      try {
        session = await navigator.xr.requestSession('immersive-vr', init);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!session) throw lastError ?? new Error('the headset refused every session type');

    // Use the best reference space this session actually granted. Asking three.js
    // for one that was not granted leaves the headset on a loading screen for
    // ever, which is a miserable thing to debug.
    this.floorReferenced = false;
    let space = 'viewer';
    for (const candidate of ['local-floor', 'local', 'viewer']) {
      try {
        await session.requestReferenceSpace(candidate);
        space = candidate;
        this.floorReferenced = candidate === 'local-floor';
        break;
      } catch { /* try the next one */ }
    }

    this.viewer.renderer.xr.setReferenceSpaceType(space);
    await this.viewer.renderer.xr.setSession(session);

    this.session = session;
    session.addEventListener('end', () => this._teardown());

    this._buildControllers();
    this._enterScene();
    this.ctx.onStart?.(space);
  }

  async exit() {
    await this.session?.end();
  }

  /* ------------------------------------------------------------- setup -- */

  _buildControllers() {
    if (this.controllers.length) return;

    const { renderer, player } = this.viewer;
    const factory = new XRControllerModelFactory();

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)
    ]);

    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      controller.addEventListener('selectstart', () => this._onTrigger(controller));

      const ray = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({
        color: 0x00A896, transparent: true, opacity: 0.75
      }));
      ray.scale.z = 5;
      ray.name = 'ray';
      controller.add(ray);
      player.add(controller);

      const grip = renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      player.add(grip);

      this.controllers.push(controller);
    }
  }

  /** Put the player on the floor a couple of metres in front of the model. */
  _enterScene() {
    const v = this.viewer;
    const scale = this.ctx.getUnitScale();

    this._saved = {
      cameraPosition: v.camera.position.clone(),
      cameraQuaternion: v.camera.quaternion.clone(),
      target: v.controls.target.clone(),
      grid: v.grid.visible,
      overlay: v.overlay.visible,
      markers: v.lightMarkers?.visible ?? false,
      controls: v.controls.enabled
    };

    v.controls.enabled = false;
    v.grid.visible = false;
    v.overlay.visible = false;
    if (v.lightMarkers) v.lightMarkers.visible = false;

    v.camera.position.set(0, 0, 0);
    v.camera.quaternion.identity();

    const box = new THREE.Box3().setFromObject(v.root);
    const player = v.player;
    player.scale.setScalar(scale);

    if (box.isEmpty()) {
      player.position.set(0, 0, 3 * scale);
      player.rotation.set(0, 0, 0);
      return;
    }

    const centre = box.getCenter(new THREE.Vector3());
    // With a floor-referenced space the headset reports height above the floor;
    // without one the head sits at the origin, so lift the rig to eye level.
    const eye = this.floorReferenced ? 0 : 1.6 * scale;
    player.position.set(centre.x, box.min.y + eye, box.max.z + 2.2 * scale);

    // face the model: a yaw of t maps -Z to (-sin t, 0, -cos t)
    const dx = centre.x - player.position.x;
    const dz = centre.z - player.position.z;
    player.rotation.set(0, Math.atan2(-dx, -dz), 0);
  }

  _teardown() {
    const v = this.viewer;
    const saved = this._saved;
    this.session = null;

    if (saved) {
      v.camera.position.copy(saved.cameraPosition);
      v.camera.quaternion.copy(saved.cameraQuaternion);
      v.controls.target.copy(saved.target);
      v.grid.visible = saved.grid;
      v.overlay.visible = saved.overlay;
      if (v.lightMarkers) v.lightMarkers.visible = saved.markers;
      v.controls.enabled = saved.controls;
      this._saved = null;
    }

    v.player.position.set(0, 0, 0);
    v.player.rotation.set(0, 0, 0);
    v.player.scale.setScalar(1);
    v.controls.update();

    this.ctx.onEnd?.();
  }

  /* ----------------------------------------------------------- pointing -- */

  _onTrigger(controller) {
    this._tempMatrix.identity().extractRotation(controller.matrixWorld);
    this._raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMatrix);

    const hit = this._raycaster
      .intersectObjects(this.viewer.root.children, true)
      .find((h) => h.object.isMesh && h.object.visible);

    if (hit) this.ctx.onTrigger?.(hit);
  }

  /* --------------------------------------------------------- locomotion -- */

  update(dt) {
    const session = this.viewer.renderer.xr.getSession();
    if (!session) return;

    const scale = this.viewer.player.scale.x || 1;
    let snapped = false;

    for (const source of session.inputSources) {
      const pad = source.gamepad;
      if (!pad || pad.axes.length < 2) continue;

      // thumbsticks are axes 2/3 on most controllers, 0/1 on older touchpads
      const x = pad.axes.length >= 4 ? pad.axes[2] : pad.axes[0];
      const y = pad.axes.length >= 4 ? pad.axes[3] : pad.axes[1];

      if (source.handedness === 'right') {
        if (Math.abs(x) > 0.7) {
          if (this._snapArmed) {
            this.viewer.player.rotateY(THREE.MathUtils.degToRad(-Math.sign(x) * SNAP_TURN));
            this._snapArmed = false;
          }
          snapped = true;
        }
        continue;
      }

      if (Math.hypot(x, y) < DEADZONE) continue;
      this._glide(x, y, dt * MOVE_SPEED * scale);
    }

    if (!snapped) this._snapArmed = true;
  }

  /** Move the rig on the horizontal plane, relative to where you are looking. */
  _glide(x, y, distance) {
    const camera = this.viewer.camera;
    const player = this.viewer.player;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) return;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    player.position.addScaledVector(forward, -y * distance);
    player.position.addScaledVector(right, x * distance);
  }
}
