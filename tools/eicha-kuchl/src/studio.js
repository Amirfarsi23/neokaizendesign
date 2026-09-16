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

    try {
      const arraybuffer = await exporter.parseAsync(v.root);
      return new Blob([arraybuffer], { type: 'model/vnd.usdz+zip' });
    } finally {
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
