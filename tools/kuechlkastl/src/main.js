import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { Viewer } from './viewer.js';
import { loadModel, loadModelFromUrl, SUPPORTED } from './loaders.js';
import { buildDemoKitchen } from './demo.js';
import { Rig, Joint, assignStableIds, guessUnitsPerMetre } from './motion.js';
import { collectEdges, pickEdge, resolveSelection, makeEdgeOverlay } from './picking.js';
import { Panel, hint, loading, download } from './ui.js';
import { Studio } from './studio.js';
import { LightRig } from './lights.js';
import { Gizmo } from './gizmo.js';
import { MountRegistry, resetMount, contentBounds } from './transforms.js';
import { GroupRegistry } from './groups.js';
import { History } from './history.js';
import { VR } from './vr.js';
import { AR } from './ar.js';
import { ClipBox } from './clipbox.js';
import { Watermark } from './watermark.js';
import { Extras, buildSurface } from './extras.js';
import { setLanguage, storedLanguage, language } from './i18n.js';
import { initTabs, showTab, MaterialPanel, ScenePanel, LightsPanel, GroupsPanel } from './panels.js';

const viewer = new Viewer(document.getElementById('viewport'));
const rig = new Rig(viewer.root);
const studio = new Studio(viewer);
const lightRig = new LightRig(viewer);
const mounts = new MountRegistry(viewer.root);
const groups = new GroupRegistry();
const gizmo = new Gizmo(viewer);
const clipBox = new ClipBox(viewer);
const extras = new Extras(viewer);
const watermark = new Watermark({ src: './assets/logo.png', colour: '#ffffff', opacity: 0.38 });

const state = {
  mode: 'edit',           // 'edit' | 'present'
  tool: 'select',         // 'select' | 'axis' | 'direction' | 'place-light'
  pendingType: null,      // 'hinge' | 'slide'
  pendingLight: null,     // { type, entry }
  model: null,
  sourceName: null,
  meshCount: 0,
  sidIndex: new Map(),
  selection: [],
  edges: null,            // { segments, mode }
  xray: false,
  hidden: new Set(),
  gizmoOn: false,
  gizmoLight: null       // the light entry the handles are on, if any
};

/** Default swing of a newly created hinge, in degrees. */
const DEFAULT_HINGE_ANGLE = 85;
/** Default drawer travel, in metres. */
const DEFAULT_SLIDE_TRAVEL = 0.5;

/* ------------------------------------------------------------- overlays -- */

const helpers = new THREE.Group();
viewer.overlay.add(helpers);

const edgeOverlay = new THREE.Group();
viewer.overlay.add(edgeOverlay);

const hoverMaterial = new LineMaterial({
  color: 0x3ad8c2, linewidth: 4, transparent: true, depthTest: false, depthWrite: false
});
const hoverLine = new Line2(new LineGeometry(), hoverMaterial);
hoverLine.renderOrder = 1000;
hoverLine.visible = false;
hoverLine.frustumCulled = false;
viewer.overlay.add(hoverLine);

function syncHoverResolution() {
  const size = viewer.renderer.getSize(new THREE.Vector2());
  hoverMaterial.resolution.set(size.x, size.y);
}
addEventListener('resize', syncHoverResolution);
syncHoverResolution();

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose();
    child.material?.dispose();
  }
}

function refreshHelpers() {
  clearGroup(helpers);
  if (state.mode !== 'edit') return;
  for (const obj of state.selection) {
    const helper = new THREE.BoxHelper(obj, 0x00A896);
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.renderOrder = 998;
    helpers.add(helper);
  }
}

/* -------------------------------------------------------------- gizmo -- */

/**
 * What the handles should drive for the current selection: a rigged part uses
 * its Joint's mount (so moving a cabinet never disturbs its hinge), anything
 * else gets a free mount created on demand.
 */
function gizmoTargetForSelection() {
  if (!state.selection.length) return null;
  const joint = state.selection.map((o) => rig.jointAt(o)).find(Boolean);
  if (joint?.mount) return joint.mount;
  return mounts.acquire(state.selection);
}

function refreshGizmo() {
  const bar = document.getElementById('gizmo-bar');

  if (!state.gizmoOn || state.mode !== 'edit') {
    gizmo.detach();
    bar.hidden = true;
    document.getElementById('transform-pane').hidden = true;
    return;
  }

  const target = state.gizmoLight ? state.gizmoLight.object : gizmoTargetForSelection();
  if (!target) {
    gizmo.detach();
    bar.hidden = true;
    document.getElementById('transform-pane').hidden = true;
    return;
  }

  // scaling a light source is meaningless
  if (state.gizmoLight && gizmo.mode === 'scale') setGizmoMode('translate');

  gizmo.attach(target);
  bar.hidden = false;
  syncTransformFields();
}

function setGizmoMode(mode) {
  if (state.gizmoLight && mode === 'scale') {
    hint('Lights cannot be scaled — use the Lights tab for size');
    return;
  }
  state.gizmoOn = true;
  gizmo.setMode(mode);
  for (const b of document.querySelectorAll('[data-gizmo]')) {
    b.classList.toggle('active', b.dataset.gizmo === mode);
  }
  refreshGizmo();
}

function hideGizmo() {
  state.gizmoOn = false;
  refreshGizmo();
}

/** Write the gizmo target's numbers into the Transform fields. */
const _euler = new THREE.Euler();

function syncTransformFields() {
  const pane = document.getElementById('transform-pane');
  const target = gizmo.target;
  if (!target) { pane.hidden = true; return; }

  pane.hidden = false;
  document.getElementById('transform-target').textContent =
    state.gizmoLight ? state.gizmoLight.name
      : (state.selection[0]?.name || `${state.selection.length} parts`);

  _euler.setFromQuaternion(target.quaternion, 'XYZ');
  const set = (id, value) => {
    const input = document.getElementById(id);
    if (document.activeElement !== input) input.value = value;
  };
  set('tf-px', round(target.position.x));
  set('tf-py', round(target.position.y));
  set('tf-pz', round(target.position.z));
  set('tf-rx', Math.round(THREE.MathUtils.radToDeg(_euler.x)));
  set('tf-ry', Math.round(THREE.MathUtils.radToDeg(_euler.y)));
  set('tf-rz', Math.round(THREE.MathUtils.radToDeg(_euler.z)));
}

function readTransformFields() {
  const target = gizmo.target;
  if (!target) return;
  const num = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : 0;
  };
  target.position.set(num('tf-px'), num('tf-py'), num('tf-pz'));
  target.quaternion.setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(num('tf-rx')),
    THREE.MathUtils.degToRad(num('tf-ry')),
    THREE.MathUtils.degToRad(num('tf-rz')),
    'XYZ'
  ));
  target.updateMatrixWorld(true);
  onGizmoChanged();
  onGizmoCommitted();
}

function onGizmoChanged() {
  if (state.gizmoLight) lightRig.readBack(state.gizmoLight);
  refreshHelpers();
  syncTransformFields();
}

function onGizmoCommitted() {
  refreshRootInverse();
  commit(gizmo.mode === 'rotate' ? 'rotate' : gizmo.mode === 'scale' ? 'scale' : 'move');
}

gizmo.onChange = onGizmoChanged;
gizmo.onCommit = onGizmoCommitted;

const round = (n) => Math.round(n * 1e4) / 1e4;

/* ------------------------------------------------------- root transform -- */

const _invRoot = new THREE.Matrix4();

function refreshRootInverse() {
  viewer.root.updateMatrixWorld(true);
  _invRoot.copy(viewer.root.matrixWorld).invert();
}

/** World point -> root-local, so joints survive model reorientation. */
const toRootPoint = (v) => v.clone().applyMatrix4(_invRoot);
/** World direction -> root-local (normalised, translation ignored). */
const toRootDir = (d) => d.clone().transformDirection(_invRoot).normalize();

/* ------------------------------------------------------ x-ray and hiding -- */

const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 0x9fb3c8, roughness: 0.9, metalness: 0,
  transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide
});

/**
 * Re-apply the two things that ride on a mesh's material: x-ray ghosting and
 * the section box's clipping planes. Both need a full traversal, so they share
 * one.
 */
function applyXray() {
  if (!state.model) return;
  const keep = new Set();
  for (const obj of state.selection) {
    obj.traverse((m) => { if (m.isMesh) keep.add(m); });
  }
  const planes = clipBox.active ? clipBox.planes : null;

  viewer.root.traverse((mesh) => {
    if (!mesh.isMesh) return;

    const ghost = state.xray && state.mode === 'edit' && !keep.has(mesh);
    if (ghost) {
      if (mesh.userData._preXray === undefined) mesh.userData._preXray = mesh.material;
      mesh.material = ghostMaterial;
    } else if (mesh.userData._preXray !== undefined) {
      mesh.material = mesh.userData._preXray;
      delete mesh.userData._preXray;
    }

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material || material.clippingPlanes === planes) continue;
      material.clippingPlanes = planes;
      material.clipShadows = true;
      material.needsUpdate = true;
    }
  });
  ghostMaterial.clippingPlanes = planes;
}

function setXray(on) {
  state.xray = on;
  document.getElementById('btn-xray').classList.toggle('toggled', on);
  applyXray();
  hint(on
    ? 'X-ray on — everything but the selection is ghosted'
    : 'X-ray off');
}

function hideSelection() {
  if (!state.selection.length) return;
  for (const obj of state.selection) {
    obj.visible = false;
    state.hidden.add(obj);
  }
  const n = state.selection.length;
  setSelection([]);
  hint(`Hid ${n} part${n === 1 ? '' : 's'} — <b>Shift+H</b> brings them back`);
  commit('hide');
}

function showAllHidden() {
  if (!state.hidden.size) return hint('Nothing is hidden');
  const n = state.hidden.size;
  for (const obj of state.hidden) obj.visible = true;
  state.hidden.clear();
  hint(`Restored ${n} hidden part${n === 1 ? '' : 's'}`);
  commit('show all');
}

/** Put visibility back to what a snapshot recorded. */
function applyHidden(sids) {
  for (const obj of state.hidden) obj.visible = true;
  state.hidden.clear();
  for (const sid of sids ?? []) {
    const obj = state.sidIndex.get(sid);
    if (!obj) continue;
    obj.visible = false;
    state.hidden.add(obj);
  }
}

/* ------------------------------------------------------------ selection -- */

const panel = new Panel({
  onDelete: (joint) => {
    rig.remove(joint);
    hint(`Removed <b>${joint.name}</b>`);
  },
  onLimits: (joint) => {
    joint.setValue(THREE.MathUtils.clamp(
      joint.value,
      Math.min(joint.min, joint.max),
      Math.max(joint.min, joint.max)
    ));
    renderPanel();
    commit('motion limits');
  },
  onFocus: (joint) => {
    setSelection(joint.objects);
    panel.setActive(joint);
  }
});

rig.onChange = () => { mounts.prune(); renderPanel(); refreshGizmo(); commit('motion'); };

function renderPanel() {
  panel.render(rig.joints, rig.unitsPerMetre);
  updateSelectionInfo();
}

function setSelection(objects, note = '') {
  state.selection = objects;
  if (objects.length) state.gizmoLight = null;
  refreshHelpers();
  applyXray();
  updateSelectionInfo(note);
  materialPanel?.onSelectionChanged(objects);
  refreshGizmo();
}

function selectLight(entry) {
  state.selection = [];
  state.gizmoLight = entry;
  refreshHelpers();
  applyXray();
  updateSelectionInfo();
  lightsPanel.setActive(entry);
  refreshGizmo();
}

function updateSelectionInfo(note = '') {
  const n = state.selection.length;
  if (!n) {
    panel.setSelection('Nothing selected.', false);
    panel.setActive(null);
    return;
  }
  const rigged = state.selection.map((o) => rig.jointAt(o)).find(Boolean);
  const label = n === 1
    ? (state.selection[0].name || 'Unnamed part')
    : `${n} parts selected`;

  const group = state.selection.map((o) => groups.groupOf(o)).find(Boolean);
  const prefix = group ? `${group.name} (group)` : label;

  if (rigged) {
    panel.setSelection(`${prefix} — already driven by "${rigged.name}".`, false);
    panel.setActive(rigged);
  } else {
    panel.setSelection(note ? `${prefix} · ${note}` : prefix, true);
    panel.setActive(null);
  }

  $('btn-group').disabled = state.selection.length < 2 || Boolean(group);
  $('btn-ungroup').disabled = !group;
}

/* -------------------------------------------------------------- groups -- */

function groupSelection() {
  if (state.selection.length < 2) return hint('Select two or more parts first');
  const group = groups.create(state.selection);
  if (!group) return;
  // build the shared mount now so the group is rigid from this moment on
  mounts.acquire(group.objects);
  setSelection(group.objects);
  hint(`Grouped <b>${group.objects.length}</b> parts as "${group.name}"`);
}

function ungroupSelection() {
  const group = state.selection.map((o) => groups.groupOf(o)).find(Boolean);
  if (!group) return hint('Nothing grouped in the selection');
  groups.remove(group);
  hint(`Ungrouped <b>${group.name}</b>`);
}

/* ------------------------------------------------------------ edge mode -- */

function enterAxisMode(type) {
  if (!state.selection.length) return;
  state.pendingType = type;

  if (type === 'hinge') {
    const mode = document.getElementById('chk-bbox-edges').checked ? 'bbox' : 'model';
    state.edges = collectEdges(state.selection, mode);
    clearGroup(edgeOverlay);
    edgeOverlay.add(makeEdgeOverlay(state.edges.segments, 0x1C39BB, 0.55));
    state.tool = 'axis';
    hint('Click the <b>edge</b> the part should rotate around · <b>Esc</b> to cancel', true);
  } else {
    state.tool = 'direction';
    hint('Click the <b>face</b> the part should slide out of · <b>Esc</b> to cancel', true);
  }
  viewer.renderer.domElement.style.cursor = 'crosshair';
}

function enterLightPlacement(type, entry = null) {
  if (!state.model) return hint('Load a model first');
  state.tool = 'place-light';
  state.pendingLight = { type, entry };
  viewer.renderer.domElement.style.cursor = 'crosshair';
  hint(entry
    ? `Click a surface to move <b>${entry.name}</b> there · <b>Esc</b> to cancel`
    : `Click the surface the <b>${type}</b> shines from · <b>Esc</b> to cancel`, true);
}

function placeLight(hit) {
  refreshRootInverse();

  const normal = hit.face
    ? hit.face.normal.clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
        .normalize()
    : new THREE.Vector3(0, -1, 0);

  // point the beam away from the surface, into the room
  const toCamera = viewer.camera.position.clone().sub(hit.point);
  if (normal.dot(toCamera) < 0) normal.negate();

  const offset = 0.03 * rig.unitsPerMetre;
  const position = toRootPoint(hit.point.clone().addScaledVector(normal, offset));
  const direction = toRootDir(normal);

  const { type, entry } = state.pendingLight;
  if (entry) {
    entry.position.copy(position);
    lightRig.aim(entry, direction);
    lightRig.onChange();
    hint(`Moved <b>${entry.name}</b>`);
  } else {
    const created = lightRig.add(type, position, direction);
    lightsPanel.setActive(created);
    hint(`<b>${created.name}</b> placed — adjust brightness in the list`);
  }
  exitAxisMode();
}

function exitAxisMode() {
  state.tool = 'select';
  state.pendingType = null;
  state.pendingLight = null;
  lightsPanel?.clearPlacementState();
  state.edges = null;
  hoverLine.visible = false;
  clearGroup(edgeOverlay);
  viewer.renderer.domElement.style.cursor = '';
  hint('');
}

function setHoverEdge(edge) {
  if (!edge) { hoverLine.visible = false; return; }
  const g = new LineGeometry();
  g.setPositions([edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z]);
  hoverLine.geometry.dispose();
  hoverLine.geometry = g;
  hoverLine.visible = true;
}

/* -------------------------------------------------------- joint creation -- */

function partCentre(objects) {
  const box = new THREE.Box3();
  for (const o of objects) box.union(new THREE.Box3().setFromObject(o));
  return box.getCenter(new THREE.Vector3());
}

/**
 * Pick the rotation sign so the part swings toward the camera - which is
 * almost always "out of the cabinet", because the user is looking at the front
 * of the unit when they set the hinge. "Flip" fixes the rest.
 */
function orientHinge(axis, origin, objects) {
  const centre = partCentre(objects);
  const radius = centre.clone().sub(origin);
  radius.addScaledVector(axis, -radius.dot(axis));    // component perpendicular to the axis
  if (radius.lengthSq() < 1e-9) return axis;

  const probe = radius.clone().applyAxisAngle(axis, THREE.MathUtils.degToRad(5)).sub(radius);
  const toCamera = viewer.camera.position.clone().sub(centre).normalize();
  if (probe.dot(toCamera) < 0) axis.negate();
  return axis;
}

function createHinge(edge) {
  refreshRootInverse();

  const axisWorld = edge.b.clone().sub(edge.a).normalize();
  const originWorld = edge.a.clone().add(edge.b).multiplyScalar(0.5);
  orientHinge(axisWorld, originWorld, state.selection);

  const joint = rig.add(new Joint({
    type: 'hinge',
    name: nameFor('Hinge'),
    objects: [...state.selection],
    origin: toRootPoint(originWorld),
    axis: toRootDir(axisWorld),
    min: 0,
    max: DEFAULT_HINGE_ANGLE
  }));

  exitAxisMode();
  panel.setActive(joint);
  joint.setTarget(joint.max);
  hint(`<b>${joint.name}</b> created — opens to ${DEFAULT_HINGE_ANGLE}°, editable in the list`);
}

function createSlide(intersection) {
  refreshRootInverse();

  const normal = intersection.face
    ? intersection.face.normal.clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld))
        .normalize()
    : viewer.camera.getWorldDirection(new THREE.Vector3()).negate();

  const toCamera = viewer.camera.position.clone().sub(intersection.point);
  if (normal.dot(toCamera) < 0) normal.negate();

  const joint = rig.add(new Joint({
    type: 'slide',
    name: nameFor('Slide'),
    objects: [...state.selection],
    origin: toRootPoint(partCentre(state.selection)),
    axis: toRootDir(normal),
    min: 0,
    max: DEFAULT_SLIDE_TRAVEL * rig.unitsPerMetre
  }));

  exitAxisMode();
  panel.setActive(joint);
  joint.setTarget(joint.max);
  hint(`<b>${joint.name}</b> created — ${state.selection.length} part(s) travel together`);
}

function nameFor(prefix) {
  const base = state.selection[0]?.name?.trim();
  if (base && state.selection.length === 1) return base;
  if (base) return `${base} +${state.selection.length - 1}`;
  return `${prefix} ${rig.joints.length + 1}`;
}

/* ----------------------------------------------------------- raycasting -- */

/** Visibility including ancestors — `object.visible` alone is not enough. */
function isVisible(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

const lastPick = { x: -1e9, y: -1e9, index: 0, count: 0 };

/**
 * Hits under the cursor, one per selectable part and sorted front to back.
 * Clicking the same spot repeatedly steps deeper, which is how you reach the
 * sides and base of a drawer box without moving the camera.
 */
function hitsUnder(event) {
  if (!state.model) return [];
  const rc = viewer.raycaster(event);
  const raw = rc.intersectObjects(viewer.root.children, true);

  const seen = new Set();
  const unique = [];
  for (const hit of raw) {
    if (!hit.object.isMesh || !isVisible(hit.object)) continue;
    if (!clipBox.containsWorldPoint(hit.point)) continue;   // cut away, not pickable
    const target = resolveSelection(hit.object, viewer.root, false);
    if (seen.has(target)) continue;
    seen.add(target);
    unique.push(hit);
  }
  return unique;
}

function pickAtCursor(event, { cycle = true } = {}) {
  const hits = hitsUnder(event);
  if (!hits.length) {
    lastPick.count = 0;
    return null;
  }

  const samePlace = Math.hypot(event.clientX - lastPick.x, event.clientY - lastPick.y) < 6;
  lastPick.index = (cycle && samePlace) ? (lastPick.index + 1) % hits.length : 0;
  lastPick.x = event.clientX;
  lastPick.y = event.clientY;
  lastPick.count = hits.length;

  return hits[lastPick.index];
}

const canvas = viewer.renderer.domElement;
let downPoint = null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;

  // a section-box face takes the drag before the camera does
  const handle = clipBox.hit(viewer.raycaster(e));
  if (handle) {
    clipBox.beginDrag(handle);
    viewer.controls.enabled = false;
    canvas.setPointerCapture?.(e.pointerId);
    return;
  }
  downPoint = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointermove', (e) => {
  if (clipBox.dragging) {
    clipBox.updateDrag(viewer.raycaster(e));
    return;
  }
  if (state.tool !== 'axis' || !state.edges) return;
  setHoverEdge(pickEdge(viewer.raycaster(e), state.edges.segments));
});

canvas.addEventListener('pointerup', (e) => {
  if (clipBox.endDrag()) {
    viewer.controls.enabled = true;
    canvas.releasePointerCapture?.(e.pointerId);
    return;
  }
  if (e.button !== 0 || !downPoint) return;
  const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y);
  downPoint = null;
  if (moved > 5) return;            // that was an orbit, not a click
  handleClick(e);
});

function handleClick(event) {
  if (!state.model) return;
  if (gizmo.busy) return;              // that click belonged to the handles

  if (state.mode === 'present') {
    const hit = pickAtCursor(event, { cycle: false });
    const joint = hit && rig.jointAt(hit.object);
    if (joint) {
      joint.toggle();
      hint(`<b>${joint.name}</b> — ${joint.isOpen ? 'opening' : 'closing'}`);
    }
    return;
  }

  if (state.tool === 'axis') {
    const edge = pickEdge(viewer.raycaster(event), state.edges.segments);
    if (edge) createHinge(edge);
    else hint('No edge under the cursor — move closer to an edge line');
    return;
  }

  if (state.tool === 'direction') {
    const hit = pickAtCursor(event, { cycle: false });
    if (hit) createSlide(hit);
    else hint('Click a face of the part');
    return;
  }

  if (state.tool === 'place-light') {
    const hit = pickAtCursor(event, { cycle: false });
    if (hit) placeLight(hit);
    else hint('Click a surface of the model');
    return;
  }

  // a light marker takes priority over the geometry behind it
  const light = lightRig.pick(viewer.raycaster(event));
  if (light) {
    selectLight(light);
    showTab('lights');
    hint(`<b>${light.name}</b> selected — press <b>G</b> to move, <b>R</b> to aim`);
    return;
  }

  // plain selection, with depth cycling
  const hit = pickAtCursor(event, { cycle: !event.shiftKey });
  if (!hit) { setSelection([]); return; }

  const target = resolveSelection(hit.object, viewer.root, event.altKey && !groups.groupOf(hit.object));

  // Alt bypasses grouping so you can still get at an individual part
  const group = event.altKey ? null : groups.groupOf(target);
  if (group && !event.shiftKey) {
    setSelection(group.objects);
    hint(`<b>${group.name}</b> — ${group.objects.length} parts move together`);
    return;
  }

  const joint = rig.jointAt(target);
  if (joint) { setSelection(joint.objects); panel.setActive(joint); return; }

  const depth = lastPick.count > 1
    ? `layer ${lastPick.index + 1} of ${lastPick.count}`
    : '';

  if (event.shiftKey) {
    const next = state.selection.includes(target)
      ? state.selection.filter((o) => o !== target)
      : [...state.selection, target];
    setSelection(next);
  } else {
    setSelection([target], depth);
    if (lastPick.count > 1 && lastPick.index === 0) {
      hint(`<b>${target.name || 'Part'}</b> — click again to step behind it`);
    }
  }
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const key = e.key.toLowerCase();

  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && key === 'g') {
    e.preventDefault();
    e.shiftKey ? ungroupSelection() : groupSelection();
    return;
  }
  // every remaining shortcut is a bare letter — never steal Ctrl+S, Ctrl+R, ...
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === 'Escape') { exitAxisMode(); hideGizmo(); }
  else if (key === 'f') viewer.frame(state.selection.length ? boxOf(state.selection) : viewer.root);
  else if (key === 'x') setXray(!state.xray);
  else if (key === 'h') e.shiftKey ? showAllHidden() : hideSelection();
  else if (e.key === 'Delete' || e.key === 'Backspace') removeSelectedExtra();
  else if (key === 'g') setGizmoMode('translate');
  else if (key === 'r') setGizmoMode('rotate');
  else if (key === 's') setGizmoMode('scale');
});

function boxOf(objects) {
  const box = new THREE.Box3();
  for (const o of objects) box.union(new THREE.Box3().setFromObject(o));
  return box;
}

/* -------------------------------------------------------------- loading -- */

function install(object, sourceName) {
  exitAxisMode();
  rig.clear();
  setSelection([]);
  state.hidden.clear();
  materialPanel.reset();
  extras.clear();
  groups.clear();
  mounts.clear();
  state.gizmoLight = null;
  hideGizmo();
  lightRig.clear();
  viewer.clearModel();
  lightRig.reattach();

  viewer.root.add(object);
  viewer.groundAndCenter(object);

  state.model = object;
  state.sourceName = sourceName;
  // Captured once: rigging re-parents meshes out of the model group, so this
  // must not be recomputed or the autosave key would drift.
  state.meshCount = countMeshes(object);
  state.sidIndex = assignStableIds(object);

  studio.resetTransform();
  scenePanel.syncTransform(studio.transform);
  studio.applyLighting();
  refreshRootInverse();

  rig.unitsPerMetre = guessUnitsPerMetre(contentBounds(object));
  lightRig.unitsPerMetre = rig.unitsPerMetre;
  viewer.unitScale = rig.unitsPerMetre;

  clipBox.box.makeEmpty();
  clipBox.fromJSON(null, modelBounds());
  $('chk-clip').checked = false;

  viewer.frame(viewer.root);
  viewer.grid.visible = state.mode === 'edit';
  document.getElementById('dropzone').classList.add('hidden');

  renderPanel();

  // Saved work wins, but only if there is any: an autosave that happens to be
  // empty must not suppress the rig a model ships with.
  history.silently(() => {
    if (hasSavedWork()) restoreProject();
    else applyPresetJoints(object);
  });
  history.reset();
}

/**
 * Build joints from `userData.demoJoint` tags. Axis and hinge point are given in
 * the model's own coordinates, so they survive the centring and grounding that
 * install() does before this runs.
 */
function applyPresetJoints(model) {
  const tagged = [];
  model.traverse((o) => { if (o.userData.demoJoint) tagged.push(o); });
  if (!tagged.length) return 0;

  model.updateMatrixWorld(true);
  refreshRootInverse();

  for (const object of tagged) {
    const preset = object.userData.demoJoint;
    const point = new THREE.Vector3().fromArray(preset.point).applyMatrix4(model.matrixWorld);
    const axis = new THREE.Vector3().fromArray(preset.axis).transformDirection(model.matrixWorld);

    rig.add(new Joint({
      type: preset.type,
      name: object.name,
      objects: [object],
      origin: toRootPoint(point),
      axis: toRootDir(axis),
      min: preset.min ?? 0,
      max: preset.max ?? (preset.type === 'hinge' ? DEFAULT_HINGE_ANGLE
        : DEFAULT_SLIDE_TRAVEL * rig.unitsPerMetre)
    }));
  }
  return tagged.length;
}

async function openFiles(files) {
  if (!files?.length) return;
  try {
    loading('Loading model...');
    const { object, name } = await loadModel(files, (msg) => loading(msg));
    install(object, name);
    hint(`<b>${name}</b> loaded — ${state.meshCount} parts. Click a door to start.`);
  } catch (err) {
    console.error(err);
    hint(`Could not load: ${err.message}`, true);
  } finally {
    loading(null);
  }
}

/** Load a file and add it alongside the model instead of replacing it. */
async function addFiles(files) {
  if (!files?.length) return;
  if (!state.model) return hint('Load a model first, then add to it');
  try {
    loading('Loading object...');
    const { object, name } = await loadModel(files, (msg) => loading(msg));
    const added = extras.add(object, name.replace(/\.[^.]+$/, ''), state.sidIndex);
    setSelection([added]);
    setGizmoMode('translate');
    hint(`<b>${added.name}</b> added — <b>G</b> to move, <b>S</b> to scale, <b>Delete</b> to remove`);
  } catch (err) {
    console.error(err);
    hint(`Could not add: ${err.message}`, true);
  } finally {
    loading(null);
  }
}

function addSurface(kind) {
  if (!state.model) return hint('Load a model first');
  const object = buildSurface(kind, modelBounds(), rig.unitsPerMetre);
  const added = extras.add(object, object.children[0].name, state.sidIndex, { ground: kind === 'floor' });
  setSelection([added]);
  setGizmoMode('translate');
  hint(`<b>${added.name}</b> added — <b>G</b> to move, <b>S</b> to resize`);
}

/** Delete removes added objects only; the imported model is never touched. */
function removeSelectedExtra() {
  const targets = [...new Set(state.selection.map((o) => extras.owning(o)).filter(Boolean))];
  if (!targets.length) return hint('Select something you added — the model itself cannot be deleted here');

  for (const object of targets) {
    for (const joint of rig.joints.filter((j) => j.objects.some((o) => isDescendant(o, object)))) {
      rig.remove(joint);
    }
    extras.remove(object);
  }
  setSelection([]);
  hint(`Removed ${targets.length} object${targets.length === 1 ? '' : 's'}`);
}

const isDescendant = (node, ancestor) => {
  for (let o = node; o; o = o.parent) if (o === ancestor) return true;
  return false;
};

function countMeshes(object) {
  let n = 0;
  object.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

/* ------------------------------------------------------ project storage -- */

const storageKey = () => `kitchen-motion:${state.sourceName}:${state.meshCount}`;

function projectJSON() {
  return {
    ...rig.toJSON({ source: state.sourceName }),
    materials: materialPanel.toJSON(),
    groups: groups.toJSON(),
    placements: mounts.toJSON(),
    lights: lightRig.toJSON(),
    hidden: [...state.hidden]
      .map((o) => o.userData.sid)
      .filter((s) => s !== undefined),
    lighting: studio.lighting,
    transform: studio.transform,
    section: clipBox.toJSON()
  };
}

function saveProject() {
  if (!state.model) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(projectJSON()));
  } catch { /* quota or private mode - not critical */ }
}

/* ------------------------------------------------------------- history -- */

const history = new History({
  capture: () => JSON.stringify(projectJSON()),
  apply: (json) => loadProject(JSON.parse(json), { announce: false }),
  onChange: (h) => {
    $('btn-undo').disabled = !h.canUndo;
    $('btn-redo').disabled = !h.canRedo;
  }
});

/** Record a change and persist it. Every mutating action funnels through here. */
function commit(label) {
  if (!state.model || history.suspended) return;
  history.commit(label);
  saveProject();
}

function undo() {
  const label = history.undo();
  if (!label) return hint('Nothing to undo');
  saveProject();
  refreshGizmo();
  hint(`Undo — ${label}`);
}

function redo() {
  const label = history.redo();
  if (!label) return hint('Nothing to redo');
  saveProject();
  refreshGizmo();
  hint(`Redo — ${label}`);
}

function loadProject(data, { announce = true } = {}) {
  // Validate before touching anything: this function dismantles the scene
  // before rebuilding it, so throwing halfway would leave a wreck.
  if (data?.format !== 'kitchen-motion-rig') {
    throw new Error('Not a Kitchen Motion rig file.');
  }

  // remember the selection by stable id — restoring re-parents things
  const selected = state.selection.map((o) => o.userData.sid);
  gizmo.detach();
  setSelection([]);

  mounts.dissolve();                       // unwrap placements before rebuilding
  const { loaded, skipped } = rig.fromJSON(data, state.sidIndex);
  const materials = materialPanel.fromJSON(data.materials ?? [], state.sidIndex);
  const lights = lightRig.fromJSON(data.lights ?? []);
  groups.fromJSON(data.groups ?? [], state.sidIndex);
  mounts.fromJSON(data.placements ?? [], state.sidIndex);
  applyHidden(data.hidden);
  clipBox.fromJSON(data.section, modelBounds());
  $('chk-clip').checked = clipBox.active;

  if (data.transform) {
    studio.setTransform(data.transform);
    scenePanel.syncTransform(studio.transform);
  }
  if (data.lighting) {
    studio.setLighting(data.lighting);
    scenePanel.syncLighting(studio.lighting);
  }
  refreshRootInverse();
  setSelection(selected.map((s) => state.sidIndex.get(s)).filter(Boolean));

  if (announce) {
    const bits = [];
    if (loaded) bits.push(`${loaded} motion${loaded === 1 ? '' : 's'}`);
    if (materials) bits.push(`${materials} material${materials === 1 ? '' : 's'}`);
    if (lights) bits.push(`${lights} light${lights === 1 ? '' : 's'}`);
    if (bits.length) hint(`Restored ${bits.join(' and ')}`);
  }
  return { loaded, skipped, materials, lights };
}

/** Is there an autosave for this model that actually contains something? */
function hasSavedWork() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return false;
    const d = JSON.parse(raw);
    return Boolean(d.joints?.length || d.materials?.length || d.lights?.length
      || d.groups?.length || d.placements?.length || d.hidden?.length);
  } catch {
    return false;
  }
}

function restoreProject() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) loadProject(JSON.parse(raw));
  } catch { /* stale or corrupt - start clean */ }
}

/* ------------------------------------------------------------- controls -- */

const $ = (id) => document.getElementById(id);

/**
 * The model's extents, in root-local space — what the section box starts from.
 * Measured off `root` rather than the model group, because rigging and moving
 * parts re-parents them out of it.
 */
function modelBounds() {
  if (!state.model) return new THREE.Box3();
  const world = contentBounds(viewer.root);
  if (world.isEmpty()) return world;
  return world.applyMatrix4(new THREE.Matrix4().copy(viewer.root.matrixWorld).invert());
}

initTabs();

const materialPanel = new MaterialPanel({
  viewer,
  hint,
  getSelection: () => state.selection,
  getRoot: () => viewer.root,
  getUnitsPerMetre: () => rig.unitsPerMetre,
  onChange: () => commit('material')
});

const lightsPanel = new LightsPanel({
  rig: lightRig,
  hint,
  onPlace: (type, entry) => enterLightPlacement(type, entry),
  onChange: () => commit('light')
});

lightRig.onChange = () => { lightsPanel.render(); commit('lights'); };
lightsPanel.render();

const groupsPanel = new GroupsPanel({
  registry: groups,
  hint,
  onSelect: (group) => setSelection(group.objects),
  onChange: () => commit('group')
});

groups.onChange = () => { groupsPanel.render(); updateSelectionInfo(); commit('grouping'); };
groupsPanel.render();

const scenePanel = new ScenePanel({
  viewer,
  studio,
  hint,
  download,
  watermark,
  onChange: () => commit('scene')
});

studio.applyLighting();
scenePanel.syncLighting(studio.lighting);

$('btn-open').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => { openFiles(e.target.files); e.target.value = ''; });

$('btn-demo').addEventListener('click', () => {
  install(buildDemoKitchen(), 'demo-kitchen');
  hint(rig.joints.length
    ? `Demo kitchen — <b>${rig.joints.length}</b> doors and drawers already rigged. Switch to <b>Play</b> and click them.`
    : 'Click a door, press <b>Add hinge</b>, then click its vertical edge');
});

for (const button of document.querySelectorAll('[data-gizmo]')) {
  button.addEventListener('click', () => setGizmoMode(button.dataset.gizmo));
}
$('gz-space').addEventListener('click', (e) => {
  const space = gizmo.space === 'world' ? 'local' : 'world';
  gizmo.setSpace(space);
  e.target.textContent = space === 'world' ? 'World' : 'Local';
});
$('gz-snap').addEventListener('click', (e) => {
  const on = gizmo.setSnap(!gizmo.snapping, rig.unitsPerMetre);
  e.target.classList.toggle('active', on);
});
$('gz-off').addEventListener('click', hideGizmo);

for (const id of ['tf-px', 'tf-py', 'tf-pz', 'tf-rx', 'tf-ry', 'tf-rz']) {
  $(id).addEventListener('change', readTransformFields);
}
$('btn-transform-reset').addEventListener('click', () => {
  const target = gizmo.target;
  if (!target) return;
  if (state.gizmoLight) {
    hint('A light has no rest position — use Move to place it, or Delete it');
    return;
  }
  resetMount(target);
  onGizmoChanged();
  onGizmoCommitted();
  hint('Transform reset');
});

$('btn-add-object').addEventListener('click', () => $('add-input').click());
$('add-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
for (const button of document.querySelectorAll('[data-surface]')) {
  button.addEventListener('click', () => addSurface(button.dataset.surface));
}

extras.onChange = () => {
  const list = $('extras-list');
  list.replaceChildren();
  for (const item of extras.items) {
    const row = document.createElement('div');
    row.className = 'joint';
    const head = document.createElement('div');
    head.className = 'joint-head';

    const kind = document.createElement('span');
    kind.className = 'kind slide';
    kind.textContent = item.object.userData.surfaceKind ?? 'object';

    const label = document.createElement('span');
    label.style.flex = '1';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.textContent = item.name;

    const pick = document.createElement('button');
    pick.className = 'btn tiny';
    pick.textContent = 'Select';
    pick.addEventListener('click', () => setSelection([item.object]));

    const del = document.createElement('button');
    del.className = 'btn tiny danger';
    del.textContent = 'Remove';
    del.addEventListener('click', () => { setSelection([item.object]); removeSelectedExtra(); });

    head.append(kind, label, pick, del);
    row.appendChild(head);
    list.appendChild(row);
  }
};

$('btn-add-hinge').addEventListener('click', () => enterAxisMode('hinge'));
$('btn-add-slide').addEventListener('click', () => enterAxisMode('slide'));
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-group').addEventListener('click', groupSelection);
$('btn-ungroup').addEventListener('click', ungroupSelection);
$('btn-xray').addEventListener('click', () => setXray(!state.xray));
$('btn-hide').addEventListener('click', hideSelection);
$('btn-unhide').addEventListener('click', showAllHidden);
$('btn-open-all').addEventListener('click', () => rig.openAll());
$('btn-close-all').addEventListener('click', () => rig.closeAll());

$('btn-export').addEventListener('click', () => {
  if (!state.model) return hint('Load a model first');
  download(`${(state.sourceName ?? 'project').replace(/\.[^.]+$/, '')}.rig.json`,
    JSON.stringify(projectJSON(), null, 2));
});

$('btn-import').addEventListener('click', () => $('rig-input').click());
$('rig-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !state.model) return hint('Load a model first');
  try {
    const { loaded, skipped, materials } = loadProject(JSON.parse(await file.text()), { announce: false });
    hint(`Imported <b>${loaded}</b> motions, ${materials} materials${skipped ? ` · ${skipped} unmatched` : ''}`);
  } catch (err) {
    hint(`Import failed: ${err.message}`, true);
  }
});

$('mode-switch').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg');
  if (!btn) return;
  state.mode = btn.dataset.mode;
  for (const s of $('mode-switch').children) s.classList.toggle('active', s === btn);
  exitAxisMode();
  refreshHelpers();
  applyXray();
  lightRig.setMarkersVisible(state.mode === 'edit' && $('chk-light-markers').checked);
  refreshGizmo();
  viewer.grid.visible = state.mode === 'edit';
  canvas.style.cursor = state.mode === 'present' ? 'pointer' : '';
  $('present-bar').hidden = state.mode !== 'present' || !document.body.classList.contains('presenting');
  hint(state.mode === 'present'
    ? 'Click any rigged part to open or close it'
    : 'Rig mode — select parts and add motions');
});

clipBox.onChange = () => { applyXray(); commit('section box'); };

$('chk-clip').addEventListener('change', (e) => {
  if (!state.model) { e.target.checked = false; return hint('Load a model first'); }
  if (e.target.checked) {
    clipBox.enable(modelBounds());
    hint('Drag the coloured pads to slice the model down');
  } else {
    clipBox.disable();
  }
  applyXray();
});

$('btn-clip-fit').addEventListener('click', () => {
  if (!state.model) return hint('Load a model first');
  const target = state.selection.length ? boxOf(state.selection) : modelBounds();
  const local = target.clone().applyMatrix4(
    new THREE.Matrix4().copy(viewer.root.matrixWorld).invert()
  );
  clipBox.enable(modelBounds());
  clipBox.fitTo(local);
  $('chk-clip').checked = true;
  applyXray();
  hint(state.selection.length ? 'Section fitted to the selection' : 'Section fitted to the model');
});

$('btn-clip-reset').addEventListener('click', () => {
  clipBox.reset();
  applyXray();
  hint('Section box reset to the whole model');
});

watermark.attach($('watermark'));
$('chk-watermark').addEventListener('change', (e) => watermark.setEnabled(e.target.checked));

$('chk-bbox-edges').addEventListener('change', () => {
  if (state.tool === 'axis') enterAxisMode(state.pendingType);
});

/* ------------------------------------------------------------ drag&drop -- */

const dropzone = $('dropzone');
const viewport = $('viewport');

['dragenter', 'dragover'].forEach((type) =>
  viewport.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('hidden');
    dropzone.classList.add('over');
  })
);
['dragleave', 'drop'].forEach((type) =>
  viewport.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    if (state.model) dropzone.classList.add('hidden');
  })
);
viewport.addEventListener('drop', (e) => openFiles(e.dataTransfer?.files));

/* ----------------------------------------------------------------- loop -- */

viewer.onFrame((dt, frame) => {
  if (clipBox.active) clipBox.updatePlanes();
  vr.update(dt);
  ar.update(dt, frame);
  syncHoverResolution();
  // only write to the DOM while a motion is actually animating
  if (rig.update(dt)) panel.sync(rig.joints);
  for (const h of helpers.children) h.update();
});

/* ------------------------------------------------------------------ VR -- */

const vr = new VR(viewer, {
  getUnitScale: () => rig.unitsPerMetre,
  hint,
  onTrigger: (hit) => {
    const joint = rig.jointAt(hit.object);
    if (joint) joint.toggle();
  },
  onStart: () => {
    $('btn-vr').textContent = 'Exit VR';
    $('btn-vr').classList.add('toggled');
  },
  onEnd: () => {
    $('btn-vr').textContent = 'VR';
    $('btn-vr').classList.remove('toggled');
    viewer.resize();
  }
});

// The button stays clickable even when VR is unavailable, so it can explain
// itself instead of being a dead grey rectangle.
let vrStatus = { ok: false, code: 'checking', reason: 'Checking for a headset...' };

async function refreshVrStatus() {
  vrStatus = await VR.diagnose();
  const button = $('btn-vr');
  button.hidden = false;
  button.classList.toggle('ghost', !vrStatus.ok);
  button.title = vrStatus.ok ? 'Walk around the model in a headset' : vrStatus.reason;
}

refreshVrStatus();
VR.onAvailabilityChange(refreshVrStatus);

$('btn-vr').addEventListener('click', async () => {
  await refreshVrStatus();                 // a headset may have arrived since load
  if (!vrStatus.ok) {
    hint(vrStatus.reason, true);
    console.warn('[VR unavailable]', vrStatus.code, vrStatus.reason);
    return;
  }
  try {
    if (vr.session) await vr.exit();
    else await vr.enter();
  } catch (err) {
    hint(`VR could not start: ${err.message}`, true);
  }
});

/* ------------------------------------------------------------------ AR -- */

const ar = new AR(viewer, {
  overlay: $('ar-overlay'),
  getUnitScale: () => rig.unitsPerMetre,
  hint,
  onTap: (hit) => {
    const joint = rig.jointAt(hit.object);
    if (joint) joint.toggle();
  },
  onStart: () => {
    $('ar-overlay').hidden = false;
    $('ar-hint').textContent = 'Point at the floor, then tap to place';
    $('btn-ar').classList.add('toggled');
  },
  onPlaced: () => {
    $('ar-hint').textContent = 'Tap a door or drawer to open it';
  },
  onEnd: () => {
    $('ar-overlay').hidden = true;
    $('btn-ar').classList.remove('toggled');
    studio.applyTransform();          // undo the AR placement
    viewer.resize();
  }
});

let arStatus = { ok: false, code: 'checking', reason: 'Checking for AR…' };

async function refreshArStatus() {
  arStatus = await AR.diagnose();
  const button = $('btn-ar');
  button.hidden = false;
  button.title = arStatus.ok ? 'Place the design in a real room' : arStatus.reason;
}
refreshArStatus();

$('btn-ar').addEventListener('click', async () => {
  await refreshArStatus();
  if (!arStatus.ok) {
    hint(arStatus.reason, true);
    if (arStatus.code === 'ios') showTab('scene');
    return;
  }
  if (!state.model) return hint('Load a model first');
  try {
    if (ar.session) await ar.exit();
    else await ar.enter();
  } catch (err) {
    hint(`AR could not start: ${err.message}`, true);
  }
});

// the in-AR control bar
const AR_STEPS = [0.05, 0.1, 0.25, 0.5, 1];
let arStep = AR_STEPS.length - 1;

function setArScale(index) {
  arStep = THREE.MathUtils.clamp(index, 0, AR_STEPS.length - 1);
  ar.applyScale(AR_STEPS[arStep]);
  $('ar-scale').textContent = `${Math.round(AR_STEPS[arStep] * 100)}%`;
}

$('ar-smaller').addEventListener('click', () => setArScale(arStep - 1));
$('ar-bigger').addEventListener('click', () => setArScale(arStep + 1));
$('ar-exit').addEventListener('click', () => ar.exit());
$('ar-move').addEventListener('click', () => {
  ar.replace();
  $('ar-hint').textContent = 'Point at the floor, then tap to place';
});
$('ar-open').addEventListener('click', () => {
  const anyOpen = rig.joints.some((j) => j.isOpen);
  anyOpen ? rig.closeAll() : rig.openAll();
  $('ar-open').textContent = anyOpen ? 'Open all' : 'Close all';
});
$('ar-lights').addEventListener('click', toggleInteriorLights);

$('btn-usdz').addEventListener('click', async () => {
  if (!state.model) return hint('Load a model first');
  const button = $('btn-usdz');
  button.disabled = true;
  button.textContent = 'Exporting…';
  try {
    const blob = await studio.exportUSDZ();
    download(`${(state.sourceName ?? 'design').replace(/\.[^.]+$/, '')}.usdz`, blob);
    hint('USDZ saved — put it on your website and link it with '
      + '<b>&lt;a rel="ar" href="…usdz"&gt;</b> for iPhone AR', true);
  } catch (err) {
    hint(`USDZ export failed: ${err.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Export for iPhone AR (USDZ)';
  }
});

/* ------------------------------------------------- presentation mode -- */

/**
 * A shared link opens read-only: no editing UI, just the design, the motions
 * and AR. Phones get this automatically — the editor is desktop work.
 *
 *   ?m=<model url>&r=<rig url>&view=1     explicit
 *   ?edit=1                               force the editor on a phone
 */
const params = new URLSearchParams(location.search);
const isHandheld = matchMedia('(pointer: coarse)').matches && innerWidth < 900;
const presenting = params.get('view') === '1'
  || (isHandheld && params.get('edit') !== '1');

function enterPresentationMode() {
  document.body.classList.add('presenting');
  state.mode = 'present';
  hideGizmo();
  setSelection([]);
  lightRig.setMarkersVisible(false);
  viewer.grid.visible = false;
  canvas.style.cursor = 'pointer';
  $('present-bar').hidden = false;
  refreshPresentBar();
}

function refreshPresentBar() {
  const anyOpen = rig.joints.some((j) => j.isOpen);
  $('pb-toggle').textContent = anyOpen ? 'Close all' : 'Open all';
  $('pb-lights').hidden = lightRig.lights.length === 0;
  $('pb-ar').hidden = !arStatus.ok;
}

$('pb-toggle').addEventListener('click', () => {
  rig.joints.some((j) => j.isOpen) ? rig.closeAll() : rig.openAll();
  setTimeout(refreshPresentBar, 50);
});

$('pb-lights').addEventListener('click', toggleInteriorLights);
$('pb-ar').addEventListener('click', () => $('btn-ar').click());

function toggleInteriorLights() {
  const on = lightRig.lights.some((l) => l.intensity > 0);
  for (const light of lightRig.lights) {
    if (on) {
      light._saved = light.intensity;
      light.intensity = 0;
    } else {
      light.intensity = light._saved ?? 30;
    }
    lightRig.apply(light);
  }
  for (const id of ['pb-lights', 'ar-lights']) {
    const el = $(id);
    if (el) el.textContent = on ? 'Lights on' : 'Lights off';
  }
}

/** Load a model (and optionally a rig) straight from URLs. */
async function openFromUrl(modelUrl, rigUrl) {
  try {
    loading('Loading…');
    const { object, name } = await loadModelFromUrl(modelUrl, (msg) => loading(msg));
    install(object, name);

    if (rigUrl) {
      loading('Loading the rig…');
      const response = await fetch(rigUrl);
      if (!response.ok) throw new Error(`${response.status} fetching the rig`);
      const data = await response.json();
      // the shared rig wins over anything this browser happens to have saved
      history.silently(() => loadProject(data, { announce: false }));
      history.reset();
    }
    if (presenting) refreshPresentBar();
    hint('');
  } catch (err) {
    console.error(err);
    hint(`Could not open the shared design: ${err.message}`, true);
  } finally {
    loading(null);
  }
}

if (presenting) enterPresentationMode();

const sharedModel = params.get('m');
if (sharedModel) openFromUrl(sharedModel, params.get('r'));

$('btn-share').addEventListener('click', () => {
  if (!state.model) return hint('Load a model first');
  const base = location.origin + location.pathname;
  const stem = (state.sourceName ?? 'design').replace(/\.[^.]+$/, '');
  const url = `${base}?m=models/${encodeURIComponent(state.sourceName ?? 'design.glb')}`
    + `&r=rigs/${encodeURIComponent(stem + '.rig.json')}&view=1`;

  navigator.clipboard?.writeText(url).catch(() => {});
  hint(`Upload the model to <b>models/</b> and <b>Export rig</b> to <b>rigs/</b>, `
    + `then share:<br><b>${url}</b><br>(copied to the clipboard)`, true);
});

/* ------------------------------------------------- language and feedback -- */

function applyLanguage(lang) {
  const chosen = setLanguage(lang);
  $('lang-de').classList.toggle('active', chosen === 'de');
  $('lang-en').classList.toggle('active', chosen === 'en');
  // the demo badge and the wordmark are names, not copy — leave them alone
  return chosen;
}

$('lang-de').addEventListener('click', () => applyLanguage('de'));
$('lang-en').addEventListener('click', () => applyLanguage('en'));
applyLanguage(storedLanguage());

const FEEDBACK_TO = 'info@neokaizendesign.com';
$('feedback-mail').href = `mailto:${FEEDBACK_TO}`
  + '?subject=' + encodeURIComponent('Küchlkastl — Rückmeldung / feedback');

$('btn-feedback').addEventListener('click', () => {
  const card = $('feedback-card');
  card.hidden = !card.hidden;
});

// clicking anywhere else puts the card away
addEventListener('pointerdown', (e) => {
  const card = $('feedback-card');
  if (card.hidden) return;
  if (card.contains(e.target) || e.target.closest('#btn-feedback')) return;
  card.hidden = true;
});

// debug handle - handy from the browser console when something looks wrong
window.kitchenMotion = { viewer, rig, lightRig, studio, state, gizmo, mounts, groups, history, vr, ar, clipBox, extras };

hint(`Drop a model (${SUPPORTED.join(', ')}) or press <b>Demo kitchen</b>`, true);
setTimeout(() => hint(''), 6000);
