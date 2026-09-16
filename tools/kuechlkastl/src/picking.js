import * as THREE from 'three';

/** Hard-edge threshold in degrees for EdgesGeometry. */
const EDGE_ANGLE = 18;
/** Above this many candidate segments we fall back to bounding-box edges. */
const MAX_SEGMENTS = 40000;
/** Max angular distance (radians) from the cursor ray for an edge to be pickable. */
const PICK_TOLERANCE = 0.035;

/**
 * Resolve a raycast hit to the thing the user means to select.
 * Walks up to the nearest ancestor flagged as a selection root (IFC elements),
 * otherwise returns the mesh itself. `expand` climbs one extra level (Alt+click).
 */
export function resolveSelection(mesh, root, expand = false) {
  let target = mesh;
  for (let o = mesh; o && o !== root; o = o.parent) {
    if (o.userData.selectionRoot) { target = o; break; }
  }
  if (expand && target.parent && target.parent !== root && !target.parent.isScene) {
    target = target.parent;
  }
  return target;
}

/** Every mesh under an object, in render order. */
export function meshesOf(object) {
  const out = [];
  object.traverse((o) => { if (o.isMesh && o.geometry) out.push(o); });
  return out;
}

/* ------------------------------------------------------- edge extraction -- */

function pushBoxEdges(box, segments) {
  const { min, max } = box;
  const c = [
    [min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, min.y, max.z], [min.x, min.y, max.z],
    [min.x, max.y, min.z], [max.x, max.y, min.z], [max.x, max.y, max.z], [min.x, max.y, max.z]
  ].map((v) => new THREE.Vector3(...v));

  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  for (const [i, j] of pairs) segments.push({ a: c[i], b: c[j] });
}

/**
 * Collect candidate hinge edges for a set of objects, in world space.
 * `mode` is 'model' (real hard edges) or 'bbox' (12 bounding-box edges).
 */
export function collectEdges(objects, mode = 'model') {
  const segments = [];

  if (mode === 'bbox') {
    const box = new THREE.Box3();
    for (const o of objects) box.union(new THREE.Box3().setFromObject(o));
    if (!box.isEmpty()) pushBoxEdges(box, segments);
    return { segments, mode: 'bbox' };
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  for (const object of objects) {
    for (const mesh of meshesOf(object)) {
      mesh.updateWorldMatrix(true, false);
      let edges;
      try {
        edges = new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE);
      } catch {
        continue;
      }
      const pos = edges.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld);
        if (a.distanceToSquared(b) < 1e-8) continue;
        segments.push({ a: a.clone(), b: b.clone() });
      }
      edges.dispose();
      if (segments.length > MAX_SEGMENTS) {
        return collectEdges(objects, 'bbox'); // too dense to be useful; degrade
      }
    }
  }

  if (!segments.length) return collectEdges(objects, 'bbox');
  return { segments, mode: 'model' };
}

/* ----------------------------------------------------------- edge picking -- */

const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * Shortest distance between a ray and a segment.
 * Returns { distance, rayT, point } where `point` is the closest point on the
 * segment and `rayT` the distance along the ray (used to make the metric
 * perspective-independent).
 */
function rayToSegment(ray, a, b, point) {
  _u.copy(ray.direction);       // P(s) = origin + s*u,  s >= 0
  _v.subVectors(b, a);          // Q(t) = a + t*v,       0 <= t <= 1
  _w.subVectors(ray.origin, a);

  const A = _u.dot(_u);
  const B = _u.dot(_v);
  const C = _v.dot(_v);
  const D = _u.dot(_w);
  const E = _v.dot(_w);
  const denom = A * C - B * B;

  let t;
  if (denom < 1e-10) {
    t = C > 1e-10 ? -E / C : 0;   // ray parallel to segment
  } else {
    t = (A * E - B * D) / denom;
  }
  t = Math.min(1, Math.max(0, t));

  const s = Math.max(0, (B * t - D) / A);

  _p.copy(ray.origin).addScaledVector(_u, s);
  point.copy(a).addScaledVector(_v, t);
  return { distance: _p.distanceTo(point), rayT: s };
}

/**
 * Pick the edge closest to the cursor.
 * Ranking uses angular distance (world distance / depth) so that far-away
 * edges are not unfairly favoured over near ones.
 *
 * @returns {{index:number, a:THREE.Vector3, b:THREE.Vector3, point:THREE.Vector3}|null}
 */
export function pickEdge(raycaster, segments) {
  const ray = raycaster.ray;
  const scratch = new THREE.Vector3();
  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const { distance, rayT } = rayToSegment(ray, seg.a, seg.b, scratch);
    if (rayT <= 0) continue;
    const angular = distance / rayT;
    if (angular > PICK_TOLERANCE) continue;
    // prefer nearer edges when two are equally close to the cursor
    const score = angular + rayT * 1e-4;
    if (score < bestScore) {
      bestScore = score;
      best = { index: i, a: seg.a, b: seg.b, point: scratch.clone() };
    }
  }
  return best;
}

/* --------------------------------------------------------------- helpers -- */

export function makeEdgeOverlay(segments, color, opacity, depthTest = false) {
  const positions = new Float32Array(segments.length * 6);
  segments.forEach((s, i) => {
    positions.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthTest, depthWrite: false
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.renderOrder = 999;
  return lines;
}
