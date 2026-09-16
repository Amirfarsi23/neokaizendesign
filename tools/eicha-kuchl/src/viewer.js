import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { contentBounds } from './transforms.js';

/**
 * Scene, camera, lights, render loop.
 *
 * `root` always stays at identity so that world space == root space. Every
 * pivot we build for a motion is parented to `root`, which means a hinge axis
 * measured in world space can be used verbatim as the pivot's local axis.
 * Loaded models are re-centred by transforming the model group, never `root`.
 */
export class Viewer {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true   // needed for the render-capture button
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;   // for the section box
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1116);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.02, 500);
    this.camera.position.set(3.2, 2.1, 3.8);

    // The camera hangs off a "player" rig. Outside VR the rig stays at identity
    // and OrbitControls drives the camera as usual; in VR the headset owns the
    // camera pose and locomotion moves the rig instead.
    this.player = new THREE.Group();
    this.player.name = 'player';
    this.player.add(this.camera);
    this.scene.add(this.player);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.target.set(0, 1, 0);
    // Desktop gets the cursor-directed dolly below. Touch devices keep
    // OrbitControls' own pinch, which the dolly cannot replace.
    this.controls.enableZoom = matchMedia('(pointer: coarse)').matches;

    this.unitScale = 1;                     // model units per metre
    this._installDolly();

    this.root = new THREE.Group();
    this.root.name = 'root';
    this.scene.add(this.root);

    this.overlay = new THREE.Group();       // helpers: never raycast against these
    this.overlay.name = 'overlay';
    this.scene.add(this.overlay);

    this._buildEnvironment();

    this._clock = new THREE.Clock();
    this._onFrame = [];

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time, frame) => this._tick(frame));
  }

  _buildEnvironment() {
    this.hemi = new THREE.HemisphereLight(0xdfe8f5, 0x2a2f38, 1.35);
    this.scene.add(this.hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    const d = 7;
    Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
    key.shadow.bias = -0.0009;
    this.scene.add(key);
    this.keyLight = key;

    this.scene.add(key.target);

    this.fill = new THREE.DirectionalLight(0xbdd4ff, 0.55);
    this.fill.position.set(-5, 3, -4);
    this.scene.add(this.fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.shadowCatcher = ground;

    this.grid = new THREE.GridHelper(40, 40, 0x3a4654, 0x232a33);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.scene.add(this.grid);
  }

  /**
   * Unity-style dolly: the wheel flies the camera towards whatever is under the
   * cursor, dragging the orbit target along with it.
   *
   * OrbitControls' own zoom only shortens the distance to a fixed target, so it
   * grinds to a halt once you are close to that point and you can never get near
   * anything else. Moving the target too means zoom never runs out, and orbiting
   * afterwards pivots around what you just zoomed into.
   */
  _installDolly() {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const focus = new THREE.Vector3();

    this.renderer.domElement.addEventListener('wheel', (event) => {
      if (this.controls.enableZoom) return;   // OrbitControls is handling it
      event.preventDefault();

      const camera = this.camera;
      const target = this.controls.target;

      this.ndc(event, ndc);
      raycaster.setFromCamera(ndc, camera);

      // aim at the surface under the cursor; fall back to the orbit target's depth
      const hit = raycaster.intersectObjects(this.root.children, true)
        .find((h) => h.object.isMesh && h.object.visible);

      if (hit) {
        focus.copy(hit.point);
      } else {
        focus.copy(camera.position)
          .addScaledVector(raycaster.ray.direction, camera.position.distanceTo(target));
      }

      // Respond to how far the wheel actually turned, not just its direction,
      // so trackpads and chunky mouse wheels both feel right.
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;        // lines -> pixels
      else if (event.deltaMode === 2) delta *= 400;  // pages -> pixels
      const notches = THREE.MathUtils.clamp(-delta / 100, -5, 5);

      const distance = camera.position.distanceTo(focus);
      const minTravel = 0.01 * this.unitScale;

      if (notches > 0 && distance < minTravel * 2) {
        // right up against a surface — push straight through it
        const push = raycaster.ray.direction.clone().multiplyScalar(minTravel * notches);
        camera.position.add(push);
        target.add(push);
      } else {
        // each notch closes 22% of the gap; zooming out is the exact inverse
        const alpha = 1 - Math.pow(0.78, notches);
        camera.position.lerp(focus, alpha);   // a negative alpha extrapolates
        target.lerp(focus, alpha);
      }

      this._updateClipping();
    }, { passive: false });
  }

  /** Keep the near/far planes sane as the camera flies around. */
  _updateClipping() {
    const distance = Math.max(this.camera.position.distanceTo(this.controls.target), 1e-4);
    this.camera.near = Math.max(distance / 2000, 0.0005 * this.unitScale);
    this.camera.far = Math.max(distance * 200, 20 * this.unitScale);
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn) { this._onFrame.push(fn); }

  _tick(frame) {
    const dt = Math.min(this._clock.getDelta(), 0.1);
    for (const fn of this._onFrame) fn(dt, frame);
    if (!this.renderer.xr.isPresenting) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (this.renderer.xr?.isPresenting) return;   // the headset owns the size
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Empty the model root and dispose GPU resources. */
  clearModel() {
    for (const child of [...this.root.children]) {
      if (child.userData.persistent) continue;    // light rig survives reloads
      this.root.remove(child);
      child.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m?.dispose();
        }
      });
    }
  }

  /** Centre a freshly loaded group on the origin and sit it on the ground plane. */
  groundAndCenter(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return box;
    const c = box.getCenter(new THREE.Vector3());
    object.position.x -= c.x;
    object.position.z -= c.z;
    object.position.y -= box.min.y;
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
  }

  /** Move the camera so `target` (Box3 or Object3D) fills the view. */
  frame(target, factor = 1.5) {
    const box = target?.isBox3 ? target.clone() : contentBounds(target ?? this.root);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.15);

    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (radius / Math.sin(fov / 2)) * factor;

    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.75, 1);
    dir.normalize();

    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 800, 0.01);
    this.camera.far = dist * 40;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  /** Pointer event -> normalised device coordinates. */
  ndc(event, out = new THREE.Vector2()) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return out.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      -((event.clientY - r.top) / r.height) * 2 + 1
    );
  }

  raycaster(event) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc(event), this.camera);
    return rc;
  }
}
