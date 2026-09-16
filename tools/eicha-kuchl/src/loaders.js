import * as THREE from 'three';
// Loaders are imported on demand: between them they are ~60 KB compressed and
// nobody drops seven formats at once.

export const SUPPORTED = ['ifc', 'obj', 'fbx', 'glb', 'gltf', 'stl', 'ply', 'dae'];

const ext = (name) => name.split('.').pop().toLowerCase();

/**
 * A LoadingManager that resolves sibling assets (.mtl, .bin, textures) from the
 * same drop/selection instead of hitting the network.
 */
function makeManager(files) {
  const manager = new THREE.LoadingManager();
  const urls = new Map();
  for (const f of files) urls.set(f.name.toLowerCase(), URL.createObjectURL(f));

  manager.setURLModifier((url) => {
    const base = decodeURIComponent(url.split('/').pop().split('?')[0]).toLowerCase();
    return urls.get(base) ?? url;
  });
  manager.dispose = () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  return manager;
}

const readAsArrayBuffer = (file) => file.arrayBuffer();
const readAsText = (file) => file.text();

/**
 * Load a model that lives on a server rather than on the user's disk — the path
 * a shared link takes. OBJ files name their material library inside the file,
 * so that gets fetched alongside.
 *
 * @param {string} url
 * @returns {Promise<{object: THREE.Object3D, format: string, name: string}>}
 */
export async function loadModelFromUrl(url, onProgress = () => {}) {
  const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'model';
  onProgress(`Fetching ${name}…`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} fetching ${name}`);

  const blob = await response.blob();
  const files = [new File([blob], name, { type: blob.type })];

  if (ext(name) === 'obj') {
    const text = await blob.slice(0, 4096).text();
    const mtl = text.match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
    if (mtl) {
      try {
        const base = url.slice(0, url.lastIndexOf('/') + 1);
        const r = await fetch(base + encodeURIComponent(mtl));
        if (r.ok) files.push(new File([await r.blob()], mtl));
      } catch { /* the model still loads without its materials */ }
    }
  }
  return loadModel(files, onProgress);
}

/**
 * Load a model from a set of dropped files.
 * @returns {Promise<{object: THREE.Object3D, format: string, name: string}>}
 */
export async function loadModel(fileList, onProgress = () => {}) {
  const files = [...fileList];
  const main = files.find((f) => SUPPORTED.includes(ext(f.name)));
  if (!main) {
    throw new Error(`No loadable model found. Supported: ${SUPPORTED.join(', ')}`);
  }

  const format = ext(main.name);
  onProgress(`Reading ${main.name}...`);

  const manager = makeManager(files);
  let object;

  try {
    switch (format) {
      case 'ifc':
        object = await loadIFC(await readAsArrayBuffer(main), onProgress);
        break;
      case 'obj':
        object = await loadOBJ(main, files, manager, onProgress);
        break;
      case 'fbx': {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        object = new FBXLoader(manager).parse(await readAsArrayBuffer(main), '');
        break;
      }
      case 'glb':
      case 'gltf': {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const data = format === 'glb' ? await readAsArrayBuffer(main) : await readAsText(main);
        const gltf = await new GLTFLoader(manager).parseAsync(data, '');
        object = gltf.scene;
        break;
      }
      case 'stl': {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const g = new STLLoader().parse(await readAsArrayBuffer(main));
        object = new THREE.Mesh(g, defaultMaterial());
        break;
      }
      case 'ply': {
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
        const g = new PLYLoader().parse(await readAsArrayBuffer(main));
        g.computeVertexNormals();
        object = new THREE.Mesh(g, defaultMaterial());
        break;
      }
      case 'dae': {
        const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
        const dae = new ColladaLoader(manager).parse(await readAsText(main), '');
        object = dae.scene;
        break;
      }
      default:
        throw new Error(`Unsupported format: .${format}`);
    }
  } finally {
    // give loaders time to finish fetching sibling assets before revoking
    setTimeout(() => manager.dispose?.(), 15000);
  }

  normalize(object, main.name);
  return { object, format, name: main.name };
}

function defaultMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.72, metalness: 0.04 });
}

async function loadOBJ(main, files, manager, onProgress) {
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
  const loader = new OBJLoader(manager);
  const mtlFile = files.find((f) => ext(f.name) === 'mtl');
  if (mtlFile) {
    onProgress('Reading materials...');
    const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
    const mtl = new MTLLoader(manager).parse(await readAsText(mtlFile), '');
    mtl.preload();
    loader.setMaterials(mtl);
  }
  return loader.parse(await readAsText(main));
}

/** Shared fix-ups: shadows, sane materials, colour space. */
/**
 * Keys this tool is happy to read back out of a file. Everything else in
 * `userData` is internal bookkeeping — and a glTF exported from an earlier
 * build of this tool can carry dead copies of it in each node's `extras`,
 * including a JSON husk where a BufferGeometry used to be. Restoring one of
 * those as a geometry takes the whole viewer down, so nothing but the
 * allowlist is allowed in from a file.
 */
const IMPORTABLE_USERDATA = new Set([
  'sid', 'selectionRoot', 'expressID', 'name', 'bakedTransform'
]);

function scrubUserData(object) {
  object.traverse((o) => {
    if (!o.userData) return;
    for (const key of Object.keys(o.userData)) {
      if (!IMPORTABLE_USERDATA.has(key)) delete o.userData[key];
    }
  });
}

function normalize(object, sourceName) {
  object.name ||= sourceName;
  scrubUserData(object);
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.geometry?.attributes?.position && !o.geometry.attributes.normal) {
      o.geometry.computeVertexNormals();
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.isMeshPhongMaterial) m.shininess = 12;
    }
  });
}

/* ------------------------------------------------------------------ IFC -- */

/** Where web-ifc fetches its .wasm from. Point this at a local copy for offline use. */
const IFC_WASM_PATH = 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/';

let ifcApi = null;

async function getIfcApi(onProgress) {
  if (ifcApi) return ifcApi;
  onProgress('Starting IFC engine...');
  const { IfcAPI } = await import('web-ifc');
  const api = new IfcAPI();
  api.SetWasmPath(IFC_WASM_PATH, true);
  await api.Init();
  ifcApi = api;
  return api;
}

/**
 * Parse an IFC file into one THREE.Group per IFC element, so that "select a
 * cabinet door" maps onto a real building element rather than a triangle soup.
 */
async function loadIFC(buffer, onProgress) {
  const api = await getIfcApi(onProgress);
  onProgress('Parsing IFC geometry...');

  const modelID = api.OpenModel(new Uint8Array(buffer), {
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: true
  });

  const model = new THREE.Group();
  model.name = 'IFC model';
  model.rotation.x = -Math.PI / 2; // IFC is Z-up, three.js is Y-up

  const materialCache = new Map();
  let elements = 0;

  api.StreamAllMeshes(modelID, (flatMesh) => {
    const expressID = flatMesh.expressID;
    const placed = flatMesh.geometries;
    const element = new THREE.Group();
    element.name = ifcLabel(api, modelID, expressID);
    element.userData.expressID = expressID;
    element.userData.selectionRoot = true; // clicking any face selects the element

    for (let i = 0; i < placed.size(); i++) {
      const mesh = buildIfcMesh(api, modelID, placed.get(i), materialCache);
      if (mesh) element.add(mesh);
    }
    if (element.children.length) {
      model.add(element);
      elements++;
    }
  });

  api.CloseModel(modelID);
  onProgress(`Built ${elements} IFC elements`);

  if (!elements) throw new Error('The IFC file contained no renderable geometry.');
  return model;
}

function buildIfcMesh(api, modelID, placedGeometry, materialCache) {
  const geo = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
  const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
  const indices = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
  geo.delete();

  if (!verts.length || !indices.length) return null;

  // web-ifc packs each vertex as [px, py, pz, nx, ny, nz]
  const count = verts.length / 6;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    position[i * 3] = verts[i * 6];
    position[i * 3 + 1] = verts[i * 6 + 1];
    position[i * 3 + 2] = verts[i * 6 + 2];
    normal[i * 3] = verts[i * 6 + 3];
    normal[i * 3 + 1] = verts[i * 6 + 4];
    normal[i * 3 + 2] = verts[i * 6 + 5];
  }

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(position, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  bg.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

  const mesh = new THREE.Mesh(bg, ifcMaterial(placedGeometry.color, materialCache));
  mesh.applyMatrix4(new THREE.Matrix4().fromArray(placedGeometry.flatTransformation));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function ifcMaterial({ x, y, z, w }, cache) {
  const key = `${x.toFixed(3)}_${y.toFixed(3)}_${z.toFixed(3)}_${w.toFixed(3)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshStandardMaterial({
      color: new THREE.Color(x, y, z),
      roughness: 0.68,
      metalness: 0.03,
      transparent: w < 1,
      opacity: w,
      side: w < 1 ? THREE.DoubleSide : THREE.FrontSide
    }));
  }
  return cache.get(key);
}

function ifcLabel(api, modelID, expressID) {
  try {
    const line = api.GetLine(modelID, expressID, false);
    const name = line?.Name?.value || line?.ObjectType?.value;
    let type = '';
    try {
      type = api.GetNameFromTypeCode?.(line.type) ?? '';
    } catch {
      /* older web-ifc builds do not expose this helper */
    }
    type = String(type).replace(/^IFC/i, '');
    if (name && type) return `${name} (${type})`;
    return name || type || `Element ${expressID}`;
  } catch {
    return `Element ${expressID}`;
  }
}
