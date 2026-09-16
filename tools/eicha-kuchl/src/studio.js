import * as THREE from 'three';
import { contentBounds } from './transforms.js';

/**
 * Lighting, model orientation and image capture.
 *
 * The model transform is applied to `viewer.root` rather than to the loaded
 * object, because motion pivots are parented to root too — rotating root turns
 * the rigged doors with everything else, and the joint axes (stored in root
 * space) stay valid.
 */

export const LIGHT_PRESETS = {
  studio: {
    label: 'Studio',
    sun: 2.2, ambient: 1.35, exposure: 1.05,
    sunColor: '#ffffff', skyColor: '#dfe8f5', groundColor: '#2a2f38',
    azimuth: 38, elevation: 52, background: '#0e1116'
  },
  daylight: {
    label: 'Daylight',
    sun: 3.1, ambient: 1.1, exposure: 1.0,
    sunColor: '#fff6e2', skyColor: '#cfe2ff', groundColor: '#5a5044',
    azimuth: 130, elevation: 62, background: '#1b2431'
  },
  evening: {
    label: 'Evening',
    sun: 1.5, ambient: 0.75, exposure: 1.25,
    sunColor: '#ffbb7a', skyColor: '#6f7fa8', groundColor: '#241d1a',
    azimuth: 255, elevation: 14, background: '#141118'
  },
  soft: {
    label: 'Soft box',
    sun: 1.1, ambient: 2.1, exposure: 1.1,
    sunColor: '#ffffff', skyColor: '#f2f4f8', groundColor: '#8e939b',
    azimuth: 300, elevation: 70, background: '#20242b'
  }
};

export const DEFAULT_LIGHTING = {
  preset: 'studio',
  azimuth: 38,
  elevation: 52,
  sun: 2.2,
  ambient: 1.35,
  exposure: 1.05,
  shadows: true,
  background: '#0e1116'
};

export const DEFAULT_TRANSFORM = { rx: 0, ry: 0, rz: 0, scale: 1 };

export class Studio {
  constructor(viewer) {
    this.viewer = viewer;
    this.lighting = { ...DEFAULT_LIGHTING };
    this.transform = { ...DEFAULT_TRANSFORM };
  }

  /* ----------------------------------------------------------- lighting -- */

  usePreset(name) {
    const preset = LIGHT_PRESETS[name];
    if (!preset) return this.lighting;
    this.lighting = {
      preset: name,
      azimuth: preset.azimuth,
      elevation: preset.elevation,
      sun: preset.sun,
      ambient: preset.ambient,
      exposure: preset.exposure,
      shadows: this.lighting.shadows,
      background: preset.background
    };
    this.applyLighting();
    return this.lighting;
  }

  setLighting(patch) {
    Object.assign(this.lighting, patch);
    this.applyLighting();
    return this.lighting;
  }

  applyLighting() {
    const v = this.viewer;
    const p = LIGHT_PRESETS[this.lighting.preset] ?? LIGHT_PRESETS.studio;
    const { azimuth, elevation, sun, ambient, exposure, shadows, background } = this.lighting;

    v.hemi.intensity = ambient;
    v.hemi.color.set(p.skyColor);
    v.hemi.groundColor.set(p.groundColor);

    v.keyLight.intensity = sun;
    v.keyLight.color.set(p.sunColor);
    v.keyLight.castShadow = shadows;

    v.fill.intensity = sun * 0.22;
    v.fill.color.set(p.skyColor);

    v.renderer.toneMappingExposure = exposure;
    v.scene.background = new THREE.Color(background);
    v.shadowCatcher.visible = shadows;

    this.positionSun(azimuth, elevation);
  }

  /** Place the key light on a dome around the model. */
  positionSun(azimuthDeg, elevationDeg) {
    const v = this.viewer;
    const box = contentBounds(v.root);
    const centre = box.isEmpty() ? new THREE.Vector3(0, 1, 0) : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? 5 : Math.max(box.getSize(new THREE.Vector3()).length(), 2);

    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const distance = radius * 1.4;

    v.keyLight.position.set(
      centre.x + Math.cos(el) * Math.sin(az) * distance,
      centre.y + Math.sin(el) * distance,
      centre.z + Math.cos(el) * Math.cos(az) * distance
    );
    v.keyLight.target.position.copy(centre);
    v.keyLight.target.updateMatrixWorld();

    v.fill.position.set(
      centre.x - Math.sin(az) * distance,
      centre.y + distance * 0.4,
      centre.z - Math.cos(az) * distance
    );

    const d = radius * 0.75;
    const cam = v.keyLight.shadow.camera;
    cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d;
    cam.near = distance * 0.05;
    cam.far = distance * 3;
    cam.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------- transform -- */

  setTransform(patch) {
    Object.assign(this.transform, patch);
    this.applyTransform();
    return this.transform;
  }

  resetTransform() {
    this.transform = { ...DEFAULT_TRANSFORM };
    this.applyTransform();
    return this.transform;
  }

  /** Rotate a quarter turn about one axis, accumulating on what is there. */
  nudge(axis, degrees) {
    const key = `r${axis}`;
    this.transform[key] = (this.transform[key] + degrees) % 360;
    this.applyTransform();
    return this.transform;
  }

  applyTransform() {
    const root = this.viewer.root;
    const { rx, ry, rz, scale } = this.transform;

    root.rotation.set(
      THREE.MathUtils.degToRad(rx),
      THREE.MathUtils.degToRad(ry),
      THREE.MathUtils.degToRad(rz)
    );
    root.scale.setScalar(scale);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    // keep the model standing on the floor after any reorientation
    const box = contentBounds(root);
    if (!box.isEmpty()) {
      root.position.y = -box.min.y;
      root.updateMatrixWorld(true);
    }
    this.positionSun(this.lighting.azimuth, this.lighting.elevation);
  }

  /**
   * Export the scene as a single binary glTF.
   *
   * This is the format to share: a 35 MB OBJ becomes a few MB of GLB, parses in
   * a fraction of the time, and carries its materials in one file instead of a
   * .mtl plus loose textures. Doors are exported closed so the rig's angles
   * still mean what they say.
   */
  async exportGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');

    const v = this.viewer;
    const hidden = [v.grid, v.shadowCatcher, v.overlay, v.lightMarkers].filter(Boolean);
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;

    // GLTFExporter copies userData verbatim into each node's `extras`, and ours
    // holds live references — an original BufferGeometry, materials, the Joint
    // itself. Those survive as plain JSON and corrupt the mesh on re-import.
    // Ship only the stable id, so a rig made against the source file still
    // matches the exported GLB.
    const stashed = stashUserData(v.root);

    try {
      // The export bakes `root`'s matrix — including the import correction that
      // stands a Z-up model upright — into the file, which is what makes the
      // GLB sit the right way up in Quick Look and every other viewer. Record
      // that, so re-opening it here alongside its rig flattens the baked
      // orientation instead of rotating the kitchen a second time.
      v.root.userData.bakedTransform = { ...this.transform };

      const buffer = await new Promise((resolve, reject) => {
        new GLTFExporter().parse(v.root, resolve, reject, { binary: true });
      });
      return new Blob([buffer], { type: 'model/gltf-binary' });
    } finally {
      delete v.root.userData.bakedTransform;   // live scene keeps none of this
      restoreUserData(stashed);
      hidden.forEach((o, i) => { o.visible = was[i]; });
    }
  }

  /**
   * Export the scene as USDZ — the format Apple Quick Look reads, and the only
   * way to get AR onto an iPhone without a native app. Static: Quick Look can
   * place and scale it, but cannot open a door.
   */
  async exportUSDZ() {
    const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
    const exporter = new USDZExporter();

    const v = this.viewer;
    const hidden = [v.grid, v.shadowCatcher, v.overlay, v.lightMarkers].filter(Boolean);
    const was = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;

    // USDZExporter only understands MeshStandardMaterial and silently skips
    // everything else — and an OBJ's .mtl arrives as MeshPhongMaterial, which
    // is how you end up with a valid but empty 1 KB file. Stand in for the
    // duration of the export, then put the originals back.
    const swapped = standInWithStandard(v.root);

    try {
      const arraybuffer = await exporter.parseAsync(v.root);
      const blob = new Blob([arraybuffer], { type: 'model/vnd.usdz+zip' });
      if (blob.size < 8 * 1024) {
        throw new Error('nothing exportable was found in the scene');
      }
      return blob;
    } finally {
      restoreMaterials(swapped);
      hidden.forEach((o, i) => { o.visible = was[i]; });
    }
  }

  /* ------------------------------------------------------------ capture -- */

  /**
   * Render the current view at a higher resolution and return a PNG blob.
   * Helpers and the grid are hidden for the shot.
   */
  async capture({ multiplier = 2, transparent = false, watermark = null } = {}) {
    const v = this.viewer;
    const renderer = v.renderer;

    const prevRatio = renderer.getPixelRatio();
    const prevBackground = v.scene.background;
    const prevOverlay = v.overlay.visible;
    const prevGrid = v.grid.visible;
    const prevMarkers = v.lightMarkers?.visible ?? false;

    v.overlay.visible = false;
    v.grid.visible = false;
    if (v.lightMarkers) v.lightMarkers.visible = false;
    if (transparent) {
      v.scene.background = null;
      renderer.setClearAlpha(0);
    }

    const { clientWidth: w, clientHeight: h } = v.container;
    renderer.setPixelRatio(multiplier);
    renderer.setSize(w, h, false);
    renderer.render(v.scene, v.camera);

    const width = Math.round(w * multiplier);
    const height = Math.round(h * multiplier);

    // Composite the logo in, so exports carry it as well as the screen does.
    let source = renderer.domElement;
    if (watermark?.enabled && watermark.canvas) {
      const flat = document.createElement('canvas');
      flat.width = width;
      flat.height = height;
      const ctx = flat.getContext('2d');
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      watermark.paint(ctx, width, height);
      source = flat;
    }

    const blob = await new Promise((resolve) =>
      source.toBlob(resolve, 'image/png')
    );

    v.overlay.visible = prevOverlay;
    v.grid.visible = prevGrid;
    if (v.lightMarkers) v.lightMarkers.visible = prevMarkers;
    v.scene.background = prevBackground;
    renderer.setClearAlpha(1);
    renderer.setPixelRatio(prevRatio);
    v.resize();

    return { blob, width, height };
  }
}


/* ------------------------------------------------- material stand-ins -- */

/**
 * Replace anything that is not a MeshStandardMaterial with one that carries the
 * same colour, texture and transparency. Returns what to put back afterwards.
 */
function standInWithStandard(root) {
  const swapped = [];

  const convert = (m) => {
    const std = new THREE.MeshStandardMaterial({
      color: m.color ? m.color.clone() : new THREE.Color(0xcccccc),
      map: m.map ?? null,
      normalMap: m.normalMap ?? null,
      transparent: Boolean(m.transparent),
      opacity: m.opacity ?? 1,
      side: m.side ?? THREE.FrontSide,
      // Phong's shininess is roughly the inverse of roughness
      roughness: m.roughness ?? (m.shininess !== undefined
        ? THREE.MathUtils.clamp(1 - m.shininess / 100, 0.15, 1)
        : 0.7),
      metalness: m.metalness ?? 0
    });
    if (m.map) std.map.colorSpace = THREE.SRGBColorSpace;
    return std;
  };

  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    if (list.every((m) => m?.isMeshStandardMaterial)) return;

    swapped.push({ mesh: o, original: o.material });
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => (m?.isMeshStandardMaterial ? m : convert(m)))
      : convert(o.material);
  });

  return swapped;
}

function restoreMaterials(swapped) {
  for (const { mesh, original } of swapped) {
    const stand = mesh.material;
    mesh.material = original;
    for (const m of Array.isArray(stand) ? stand : [stand]) {
      if (m && !m.isMeshStandardMaterial) continue;
      if (Array.isArray(original) ? !original.includes(m) : original !== m) m?.dispose();
    }
  }
}


/* ------------------------------------------------------ export hygiene -- */

/** Keys that are plain data and worth carrying into an exported file. */
const PORTABLE = new Set(['sid', 'selectionRoot', 'bakedTransform']);

function stashUserData(root) {
  const stashed = [];
  root.traverse((o) => {
    if (!o.userData || !Object.keys(o.userData).length) return;
    stashed.push({ object: o, original: o.userData });
    const clean = {};
    for (const key of PORTABLE) {
      if (o.userData[key] !== undefined) clean[key] = o.userData[key];
    }
    o.userData = clean;
  });
  return stashed;
}

function restoreUserData(stashed) {
  for (const { object, original } of stashed) object.userData = original;
}
