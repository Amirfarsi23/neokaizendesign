import * as THREE from 'three';

/**
 * Placeable interior lights — ceiling spots, bulbs and under-cabinet strips.
 *
 * Every light hangs off `viewer.root` so it turns with the model when the Scene
 * tab reorients it, and its saved position is in root space for the same
 * reason. Markers live in a separate group that render capture hides.
 */

let uniformsReady = false;
let nextId = 1;

export const LIGHT_TYPES = {
  point: {
    label: 'Bulb',
    hint: 'Omnidirectional — pendant lamps, open shelving',
    defaults: { intensity: 30, distance: 0, color: '#ffe6c2' }
  },
  spot: {
    label: 'Spot',
    hint: 'Cone aimed along the surface you click — ceiling downlights',
    defaults: { intensity: 60, distance: 0, angle: 34, penumbra: 0.45, color: '#fff2dd' }
  },
  strip: {
    label: 'Strip',
    hint: 'Soft rectangle — under-cabinet and cove lighting',
    defaults: { intensity: 12, width: 0.6, height: 0.04, color: '#fff6e8' }
  }
};

const MARKER_COLOUR = 0xffc86b;
const MARKER_SELECTED = 0x00A896;

export class LightRig {
  constructor(viewer) {
    this.viewer = viewer;
    this.lights = [];
    this.unitsPerMetre = 1;
    this.onChange = () => {};

    this.group = new THREE.Group();
    this.group.name = 'lights';
    this.group.userData.persistent = true;
    this.group.userData.excludeFromBounds = true;

    this.markers = new THREE.Group();
    this.markers.name = 'lightMarkers';
    this.markers.userData.persistent = true;
    this.markers.userData.excludeFromBounds = true;

    viewer.root.add(this.group, this.markers);
    viewer.lightMarkers = this.markers;
  }

  /** Re-parent after the model root has been emptied. */
  reattach() {
    if (this.group.parent !== this.viewer.root) {
      this.viewer.root.add(this.group, this.markers);
    }
  }

  clear() {
    for (const entry of [...this.lights]) this.remove(entry, { quiet: true });
    this.lights = [];
    this.onChange();
  }

  /**
   * @param {'point'|'spot'|'strip'} type
   * @param {THREE.Vector3} position  in root space
   * @param {THREE.Vector3} direction in root space — the way the light throws
   */
  add(type, position, direction, overrides = {}) {
    const spec = LIGHT_TYPES[type];
    if (!spec) throw new Error(`Unknown light type: ${type}`);

    const entry = {
      id: overrides.id ?? `l${nextId++}`,
      type,
      name: overrides.name ?? `${spec.label} ${this.lights.filter((l) => l.type === type).length + 1}`,
      position: position.clone(),
      // A full quaternion rather than just a direction, so the rotate gizmo can
      // also spin a strip in its own plane.
      quaternion: quaternionFacing(direction),
      castShadow: overrides.castShadow ?? (type === 'spot'),
      ...spec.defaults,
      ...overrides
    };
    if (overrides.quaternion) {
      entry.quaternion = new THREE.Quaternion().fromArray(overrides.quaternion);
    }

    entry.object = this._buildLight(entry);
    entry.marker = this._buildMarker(entry);
    this.group.add(entry.object);
    this.markers.add(entry.marker);

    this.lights.push(entry);
    this.apply(entry);
    this.onChange();
    return entry;
  }

  remove(entry, { quiet = false } = {}) {
    disposeTree(entry.object);
    disposeTree(entry.marker);
    entry.object.parent?.remove(entry.object);
    entry.marker.parent?.remove(entry.marker);
    this.lights = this.lights.filter((l) => l !== entry);
    if (!quiet) this.onChange();
  }

  _buildLight(entry) {
    const holder = new THREE.Group();
    holder.userData.lightId = entry.id;

    if (entry.type === 'point') {
      const light = new THREE.PointLight(entry.color, entry.intensity);
      light.castShadow = false;                       // point shadows are costly
      holder.add(light);
      holder.userData.light = light;
    } else if (entry.type === 'spot') {
      const light = new THREE.SpotLight(entry.color, entry.intensity);
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0015;
      light.shadow.camera.near = 0.05 * this.unitsPerMetre;
      // the target rides inside the holder, so aiming is pure rotation
      light.target.position.set(0, 0, -2 * this.unitsPerMetre);
      holder.add(light, light.target);
      holder.userData.light = light;
    } else {
      // 107 KB of lookup tables — fetched the first time a strip is placed
      // rather than on every page load.
      if (!uniformsReady) {
        uniformsReady = true;
        import('three/addons/lights/RectAreaLightUniformsLib.js')
          .then((m) => m.RectAreaLightUniformsLib.init())
          .catch(() => { uniformsReady = false; });
      }
      const light = new THREE.RectAreaLight(entry.color, entry.intensity, 1, 1);
      holder.add(light);
      holder.userData.light = light;
    }
    // SpotLight (and DirectionalLight) default their position to (0, 1, 0);
    // we want the light exactly at its holder's origin.
    holder.userData.light.position.set(0, 0, 0);
    return holder;
  }

  _buildMarker(entry) {
    const group = new THREE.Group();
    group.userData.lightId = entry.id;
    group.userData.isLightMarker = true;

    const r = 0.045 * this.unitsPerMetre;
    const material = new THREE.MeshBasicMaterial({
      color: MARKER_COLOUR, wireframe: true, transparent: true, opacity: 0.95
    });

    if (entry.type === 'strip') {
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    } else if (entry.type === 'spot') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2, 10), material);
      cone.rotation.x = Math.PI;                      // tip points along -Y
      group.add(cone);
    } else {
      group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material));
    }

    // a short line showing which way it throws
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(0, 0, -0.28 * this.unitsPerMetre)
      ]),
      new THREE.LineBasicMaterial({ color: MARKER_COLOUR, transparent: true, opacity: 0.6 })
    );
    beam.userData.isBeam = true;
    group.add(beam);
    group.userData.material = material;
    return group;
  }

  /** Push an entry's parameters onto its three.js objects and marker. */
  apply(entry) {
    const holder = entry.object;
    const light = holder.userData.light;

    holder.position.copy(entry.position);
    holder.quaternion.copy(entry.quaternion);
    holder.updateMatrixWorld(true);

    light.color.set(entry.color);
    light.intensity = entry.intensity;

    if (entry.type === 'spot') {
      light.angle = THREE.MathUtils.degToRad(entry.angle);
      light.penumbra = entry.penumbra;
      light.distance = entry.distance;
      light.decay = 2;
      light.castShadow = entry.castShadow;
      light.shadow.camera.far = Math.max(entry.distance || 8 * this.unitsPerMetre, 1);
    } else if (entry.type === 'point') {
      light.distance = entry.distance;
      light.decay = 2;
    } else {
      light.width = entry.width * this.unitsPerMetre;
      light.height = entry.height * this.unitsPerMetre;
    }

    this.syncMarker(entry);
  }

  /** Keep a marker sitting on its light. */
  syncMarker(entry) {
    entry.marker.position.copy(entry.position);
    entry.marker.quaternion.copy(entry.quaternion);
    if (entry.type === 'strip') {
      const plane = entry.marker.children.find((c) => c.geometry?.type === 'PlaneGeometry');
      if (plane) plane.scale.set(entry.width * this.unitsPerMetre, entry.height * this.unitsPerMetre, 1);
    }
    entry.marker.userData.material.color.set(entry.color);
  }

  /** Read a gizmo-driven holder back into its entry. */
  readBack(entry) {
    entry.position.copy(entry.object.position);
    entry.quaternion.copy(entry.object.quaternion);
    entry.object.scale.setScalar(1);          // scaling a light means nothing
    this.syncMarker(entry);
  }

  /** Point an existing light down a new direction, keeping its position. */
  aim(entry, direction) {
    entry.quaternion.copy(quaternionFacing(direction));
    this.apply(entry);
  }

  /** Unit vector the light throws along. */
  directionOf(entry) {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(entry.quaternion);
  }

  highlight(entry) {
    for (const l of this.lights) {
      l.marker.userData.material.color.set(l === entry ? MARKER_SELECTED : l.color);
    }
  }

  setMarkersVisible(visible) {
    this.markers.visible = visible;
  }

  /** Which light marker is under the cursor, if any. */
  pick(raycaster) {
    if (!this.markers.visible) return null;
    const hits = raycaster.intersectObjects(this.markers.children, true);
    for (const hit of hits) {
      if (hit.object.userData.isBeam) continue;
      const id = hit.object.parent?.userData.lightId;
      const entry = this.lights.find((l) => l.id === id);
      if (entry) return entry;
    }
    return null;
  }

  toJSON() {
    return this.lights.map((l) => ({
      id: l.id, type: l.type, name: l.name,
      position: l.position.toArray().map(round),
      quaternion: l.quaternion.toArray().map(round),
      color: l.color, intensity: round(l.intensity),
      distance: round(l.distance ?? 0),
      angle: l.angle, penumbra: l.penumbra,
      width: l.width, height: l.height,
      castShadow: l.castShadow
    }));
  }

  fromJSON(list) {
    this.clear();
    for (const raw of list ?? []) {
      if (!LIGHT_TYPES[raw.type]) continue;
      const { position, direction, ...rest } = raw;
      // saves from before free rotation stored only a direction
      const aim = direction
        ? new THREE.Vector3().fromArray(direction)
        : new THREE.Vector3(0, -1, 0);
      this.add(raw.type, new THREE.Vector3().fromArray(position), aim, rest);
    }
    return this.lights.length;
  }
}

const round = (n) => Math.round(n * 1e5) / 1e5;

/** A rotation whose -Z axis points down `direction`. */
function quaternionFacing(direction) {
  const dir = direction.clone().normalize();
  const up = Math.abs(dir.y) > 0.95
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function disposeTree(object) {
  object.traverse?.((o) => {
    o.geometry?.dispose();
    if (o.material && !Array.isArray(o.material)) o.material.dispose();
    if (o.isLight) o.dispose?.();
  });
}
