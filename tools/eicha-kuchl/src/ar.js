import * as THREE from 'three';

/**
 * Phone AR via WebXR `immersive-ar`.
 *
 * Point the phone at the floor, tap to drop the kitchen into the room, then tap
 * doors and drawers to open them. A DOM overlay carries the controls, because
 * `dom-overlay` is the only way to show real HTML on top of an AR session.
 *
 * Android/Chrome only — Safari has no `immersive-ar` at all, so iPhones need
 * the USDZ / Quick Look route instead. See `exportUSDZ` in studio.js.
 */
export class AR {
  /**
   * @param {object} ctx { onTap, getUnitScale, onStart, onEnd, hint, overlay }
   */
  constructor(viewer, ctx) {
    this.viewer = viewer;
    this.ctx = ctx;
    this.session = null;
    this.placed = false;
    this.scale = 1;                       // 1 = life size

    this._hitTestSource = null;
    this._localSpace = null;
    this._saved = null;
    this._raycaster = new THREE.Raycaster();
    this._matrix = new THREE.Matrix4();

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00A896, transparent: true, opacity: 0.9 })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    viewer.scene.add(this.reticle);
  }

  /** What this device can actually do. */
  static async diagnose() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!window.isSecureContext) {
      return { ok: false, code: 'insecure', ios,
        reason: 'AR needs an https:// page. Put the tool on your website, or use a tunnel.' };
    }
    if (ios) {
      return { ok: false, code: 'ios', ios,
        reason: 'iPhones and iPads cannot run WebXR AR — Safari does not support it. '
          + 'Use "Export for iPhone AR" to get a USDZ file that opens in Apple Quick Look.' };
    }
    if (!navigator.xr?.isSessionSupported) {
      return { ok: false, code: 'no-webxr', ios,
        reason: 'This browser has no WebXR. On Android use Chrome.' };
    }
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-ar');
      return ok
        ? { ok: true, code: 'ready', ios, reason: 'Ready' }
        : { ok: false, code: 'no-ar', ios,
            reason: 'No AR support here. On Android this needs Chrome plus Google Play '
              + 'Services for AR; on a desktop browser there is no camera pass-through.' };
    } catch (err) {
      return { ok: false, code: 'error', ios, reason: `AR check failed: ${err.message}` };
    }
  }

  async enter() {
    if (this.session) return;

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: this.ctx.overlay ? { root: this.ctx.overlay } : undefined
    });

    this.viewer.renderer.xr.setReferenceSpaceType('local');
    await this.viewer.renderer.xr.setSession(session);

    const viewerSpace = await session.requestReferenceSpace('viewer');
    this._hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    this._localSpace = this.viewer.renderer.xr.getReferenceSpace();

    this.session = session;
    this.placed = false;
    session.addEventListener('end', () => this._teardown());
    session.addEventListener('select', () => this._onSelect());

    this._enterScene();
    this.ctx.onStart?.();
  }

  async exit() {
    await this.session?.end();
  }

  /* ------------------------------------------------------------- scene -- */

  _enterScene() {
    const v = this.viewer;
    this._saved = {
      background: v.scene.background,
      grid: v.grid.visible,
      overlayVisible: v.overlay.visible,
      shadowCatcher: v.shadowCatcher.visible,
      markers: v.lightMarkers?.visible ?? false,
      controls: v.controls.enabled,
      rootMatrix: v.root.matrix.clone(),
      rootVisible: v.root.visible
    };

    // the camera feed is the background now
    v.scene.background = null;
    v.renderer.setClearAlpha(0);
    v.grid.visible = false;
    v.overlay.visible = false;
    v.shadowCatcher.visible = false;
    if (v.lightMarkers) v.lightMarkers.visible = false;
    v.controls.enabled = false;

    v.root.visible = false;           // hidden until the user taps a surface
  }

  _teardown() {
    const v = this.viewer;
    const s = this._saved;

    this._hitTestSource = null;
    this._localSpace = null;
    this.session = null;
    this.reticle.visible = false;

    if (s) {
      v.scene.background = s.background;
      v.grid.visible = s.grid;
      v.overlay.visible = s.overlayVisible;
      v.shadowCatcher.visible = s.shadowCatcher;
      if (v.lightMarkers) v.lightMarkers.visible = s.markers;
      v.controls.enabled = s.controls;
      v.root.visible = s.rootVisible;
      this._saved = null;
    }
    v.renderer.setClearAlpha(1);
    this.ctx.onEnd?.();
  }

  /* ------------------------------------------------------ place and tap -- */

  _onSelect() {
    if (!this.placed) {
      if (!this.reticle.visible) return;
      this._placeAtReticle();
      return;
    }
    // already placed: treat the tap as a pointer at whatever it hits
    const controller = this.viewer.renderer.xr.getController(0);
    this._matrix.identity().extractRotation(controller.matrixWorld);
    this._raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._matrix);

    const hit = this._raycaster
      .intersectObjects(this.viewer.root.children, true)
      .find((h) => h.object.isMesh && h.object.visible);
    if (hit) this.ctx.onTap?.(hit);
  }

  _placeAtReticle() {
    const root = this.viewer.root;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const ignored = new THREE.Vector3();
    this.reticle.matrix.decompose(position, quaternion, ignored);

    root.position.copy(position);
    root.quaternion.copy(quaternion);
    this.applyScale(this.scale);
    root.visible = true;
    this.placed = true;
    this.reticle.visible = false;
    this.ctx.onPlaced?.();
  }

  /** @param {number} factor 1 = life size, 0.1 = doll house */
  applyScale(factor) {
    this.scale = factor;
    const unit = this.ctx.getUnitScale?.() || 1;
    this.viewer.root.scale.setScalar(factor / unit);
    this.viewer.root.updateMatrixWorld(true);
  }

  /** Let the user drop it again somewhere else. */
  replace() {
    this.placed = false;
    this.viewer.root.visible = false;
  }

  /* -------------------------------------------------------------- frame -- */

  update(dt, frame) {
    if (!frame || !this._hitTestSource || this.placed) return;

    const results = frame.getHitTestResults(this._hitTestSource);
    if (!results.length) {
      this.reticle.visible = false;
      return;
    }
    const pose = results[0].getPose(this._localSpace);
    if (!pose) return;

    this.reticle.visible = true;
    this.reticle.matrix.fromArray(pose.transform.matrix);
  }
}
