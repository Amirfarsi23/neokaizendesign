# Kitchen Motion

Upload a kitchen model, tell each element how it moves, and play it back in the
browser.

The core interaction is the one you described: **select a cabinet door → press
*Add hinge* → click the edge it should swing around → it rotates.**

---

## Run it

No build step, no `npm install`. You only need Node (for the tiny static
server) and an internet connection the first time, because three.js and the IFC
engine are loaded from a CDN via an import map.

```bash
node server.mjs
```

Then open <http://localhost:5173>. The server prints your LAN addresses too, and
switches to HTTPS automatically if `certs/key.pem` and `certs/cert.pem` exist —
see [VR](#vr) for why you might want that. Any static server works
(`python -m http.server 5173` too) — it just must be served over HTTP, not
opened as a `file://` URL, because ES modules and the IFC wasm need a real
origin.

Press **Demo kitchen** to try it immediately without a file. It ships
**pre-rigged** — twelve doors and drawers already move, so you can switch
straight to Play and open them. The carcasses are hollow with shelves, the
drawers are real boxes with sides and bases, and there is an oven with a
drop-down door and a fridge, so opening something shows an interior rather than
a solid block. Every part is tagged with a `demoJoint` in `demo.js`, which
doubles as a worked example of the data an importer would need to emit.

`window.kitchenMotion` exposes `{ viewer, rig, lightRig, studio, state }` in the
browser console if you need to poke at the scene.

---

## How you use it

| Step | Action |
| --- | --- |
| 1 | Drop a model in, or press **Open model…** |
| 2 | **Click** a door. **Shift + click** adds more parts (a door and its handle). **Alt + click** grabs the parent group. |
| 3 | **Add hinge** → the part's edges light up → click the one that is the hinge line. The door swings open around it (85° by default). |
| 4 | **Add drawer** → click the face it pulls out of. Everything in the selection travels together. |
| 5 | Drag the slider, or edit the two number fields (closed value / open value). **Flip** reverses direction. |
| 6 | Switch to **Play** and click any rigged part to open or close it. |

Angles are degrees; drawer travel is shown in mm.

### Reaching inside a drawer box

A drawer is not one object — it is a front, two sides, a base and usually a
back. Three tools get you all of them:

- **Click the same spot again** to step *through* to the part behind it. The
  panel counts your depth (`layer 2 of 5`), so you can walk front → side →
  base without moving the camera.
- **X-ray** (button, or `X`) ghosts everything except the current selection, so
  you can see what you are reaching for.
- **Hide** (`H`) takes the selected parts out of the way entirely; `Shift+H`
  brings them all back.

Then **Shift + click** each piece to build the selection and press *Add drawer*
once — one motion drives the whole box.

### Supported inputs

`.ifc` · `.obj` (+ `.mtl`) · `.fbx` · `.glb` / `.gltf` · `.stl` · `.ply` · `.dae`

Drop the whole set of files together (OBJ + MTL + textures, glTF + .bin) — sibling
assets are resolved from the drop instead of the network.

IFC files are split into **one group per IFC element**, so clicking anywhere on a
door selects that door as a building element rather than a stray triangle.

---

## Materials

The **Material** tab carries a procedural library — Wood, Stone & tile, Fabric,
Wallpaper, Metal, Paint — generated on a canvas at runtime rather than
downloaded, so there are no texture assets to ship and every pattern stays
sharp at any scale.

Select parts, click a swatch, then adjust:

- **Texture size** — the real-world size of one tile, in metres
- **Rotation** — turn the pattern (parquet at 45°, grain running vertically)
- **Roughness / Metalness / Tint**

Changes apply live to whatever the selection already carries, so you can lay
parquet, then scale it, then rotate it, without re-applying.

**Use my own image…** loads any picture as a texture with the same controls.
Uploaded images are not written into the save file (they would bloat it) —
library materials are.

### Why sizes are honest

Imported models are unwrapped arbitrarily, so `repeat` normally means nothing
physical. Before assigning a material the app re-projects the mesh's UVs as a
box projection measured in model units (`projectUV` in `materials.js`), which
makes "0.3 m parquet" literally 0.3 m on the floor. *Reset to original* puts
both the material and the original geometry back.

## Undo

`Ctrl+Z` undoes, `Ctrl+Shift+Z` (or `Ctrl+Y`) redoes, 50 steps deep, and the
two arrows in the toolbar do the same. It covers motions, materials, groups,
lights, placement and scene settings — anything that ends up in the save file.

It is snapshot-based rather than command-based: the editable state already
serialises to JSON for saving, so each snapshot is nearly free and, more
importantly, cannot drift out of sync with the scene the way a pile of
hand-written inverse operations does. Restoring rebuilds joints and re-applies
materials, so on a very large model an undo takes a beat.

Camera position is deliberately *not* undoable — nothing is more annoying than
`Ctrl+Z` teleporting your view.

## VR

Press **VR** in the toolbar to stand inside the kitchen. It is greyed out with
an explanation when no headset is reachable.

| Control | Does |
| --- | --- |
| **Trigger** | Point at a rigged door or drawer and pull — it opens or closes |
| **Left stick** | Walk, relative to where you are looking |
| **Right stick** | Snap-turn 30° |

The camera lives inside a *player* rig: in XR the headset owns the camera pose,
so locomotion moves the rig instead. The rig is scaled by the model's
units-per-metre, which is what stops a millimetre-authored kitchen from making
you 1.7 mm tall. On entering, you are placed on the floor about 2.2 m in front
of the model, facing it.

### Getting it onto a headset

WebXR only runs in a **secure context** — `https://`, or `http://localhost`.
Opening `http://192.168.x.x:5173` in a Quest browser will load the page but the
VR button will stay disabled. Three ways round it, easiest first:

**1. USB tunnel (recommended for Quest).** Put the headset in developer mode,
plug it in, then on your PC:

```bash
adb reverse tcp:5173 tcp:5173
```

Now open `http://localhost:5173` *in the headset's browser* — it counts as
localhost, so no certificates are involved.

**2. Self-signed HTTPS over Wi-Fi.** Generate a pair once:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=kitchen-motion" -keyout certs/key.pem -out certs/cert.pem
```

`server.mjs` picks up `certs/` automatically and switches to HTTPS, printing
your LAN address on startup. The headset browser will warn about the untrusted
certificate — accept it once.

**3. A tunnel.** `cloudflared tunnel --url http://localhost:5173` or ngrok gives
you a real HTTPS URL that works on any headset, anywhere.

### VR limitations

- Locomotion is smooth-glide, not teleport — some people find that
  uncomfortable. Teleport would be a small addition to `vr.js`.
- No hand-tracking interactions yet (the feature is requested, but only the
  controllers are wired up).
- Shadows and the procedural materials all work, but a headset renders two eyes
  at high resolution; on a big IFC model expect to drop the shadow resolution.

## Sharing a design

The tool needs no backend, so a share link just points at two files you host
next to it:

```
https://yoursite.com/kitchen/?m=models/kitchen.glb&r=rigs/kitchen.rig.json&view=1
```

| param | meaning |
| --- | --- |
| `m` | URL of the model (relative to the page, or absolute) |
| `r` | URL of the rig JSON from **Export rig** — optional |
| `view=1` | presentation mode: no editor, just the design |
| `edit=1` | force the editor on a phone, which otherwise presents |

**Presentation mode** hides the toolbar, the panel and the handles, switches to
Play, and shows one bar: *Open all / Close all*, *Lights*, *View in AR*. Tapping
a door opens it. **Phones get this automatically** — the editor is desktop work,
so a coarse pointer under 900px wide presents unless `edit=1` says otherwise.

**Make a share link…** on the Scene tab builds the URL for the current model and
copies it to the clipboard.

Two things worth knowing:

- **Convert to glTF/GLB first.** A 35 MB OBJ is punishing over mobile data and
  slow to parse; the same model as GLB is usually 5–10× smaller.
- **Export the GLB from here, not from CAD.** The rig is matched to the model
  by stable id, and *Export model for sharing (GLB)* writes those ids into the
  file — so a rig built against the original OBJ still fits the GLB you share.
  Re-exporting from CAD instead renumbers the nodes and orphans the rig.

## AR on a phone

Press **AR**. What you get depends entirely on the phone, and the split is
not something the code can paper over:

| | Android (Chrome) | iPhone / iPad (Safari) |
| --- | --- | --- |
| WebXR `immersive-ar` | yes | **no — Safari does not implement it** |
| Place in the room | yes | yes, via Quick Look |
| Scale | yes, 5%–100% | yes, pinch |
| **Open a door** | **yes** | no |
| **Toggle the lights** | **yes** | no |

On a phone the **View in AR** button picks the route by itself: WebXR on
Android, Quick Look on iPhone. Quick Look needs a USDZ at a real URL, so the
iPhone button only appears when there is one — the hosted demo
(`demo/demo-kitchen.usdz`), or a shared design that names its own file with
`&u=path/to/design.usdz`.

`demo/` holds the demo kitchen pre-exported from this tool — GLB (211 KB), rig
and USDZ (382 KB). The share button and its QR code point at these whenever
the demo is loaded, so the public link works without hosting a client model.
Re-export them if `src/demo.js` changes.

**Android** runs the real thing: hit-test finds the floor, you tap to place, and
a `dom-overlay` control bar gives you scale, a lights toggle, open/close all,
re-place and exit. Tapping a door or drawer opens it.

**iPhone** gets **Export for iPhone AR (USDZ)** on the Scene tab. USDZ is the
only format Apple Quick Look reads, and it is static — Quick Look can place and
scale the model but cannot animate it. Host the file and link it with:

```html
<a rel="ar" href="design.usdz"><img src="preview.jpg" alt=""></a>
```

Interactive AR on iOS needs either a commercial WebAR SDK (8th Wall and similar,
paid) or a native app. There is no free browser route today.

Both need **https://** — see the VR section.

## Navigating

Left-drag orbits, right-drag pans, and the wheel flies the camera **towards
whatever is under the cursor**, dragging the orbit pivot along with it. That
means zoom never runs out, and after zooming into a drawer the camera orbits
around that drawer rather than around the middle of the room. Scroll hard
enough against a surface and you pass through it.

OrbitControls' built-in zoom only shortens the distance to a fixed target, so it
asymptotes and stops once you are close to that point — `viewer._installDolly`
replaces it. One side effect: `enableZoom` is off, so pinch-to-zoom on a
touchscreen is disabled along with it.

## Grouping parts

A chair is legs plus a seat; a base unit is a carcass plus a plinth. Select the
pieces (**Shift + click**) and press **Group** (or `Ctrl+G`). After that:

- Clicking any member selects the whole group
- The transform handles move and rotate all of it as one rigid thing
- **Alt + click** bypasses grouping when you need one raw part
- *Ungroup* (`Ctrl+Shift+G`), rename, or re-select from the **Groups** list

Groups and rigging are independent, so a group can contain rigged doors — the
group's mount simply nests their joint mounts inside it, and the doors still
swing. A part belongs to at most one group; grouping it again moves it.

## Branding

`assets/logo.png` is drawn in the bottom-right corner of the viewport and
composited into exported renders. The artwork is re-tinted onto a canvas at load
time rather than filtered in CSS, so the same pixels reach both the screen and
the PNG. Swap the file to change it; colour, opacity and size are arguments to
`new Watermark(...)` in `main.js`, and **Logo in the corner** on the Scene tab
turns it off for a render.

## Section box

Working on one cupboard in a whole house? Turn on **Section box** in the Scene
tab and the model is clipped to a cage you can drag.

- **Drag the coloured pads** on each face to slide that side in or out
- **Fit to selection** snaps the box around whatever is selected — the fastest
  way to isolate one unit
- **Whole model** puts it back

Geometry outside the box is not just hidden, it is unpickable, so you can click
around inside a cabinet without catching the wall behind it. The box is stored
in root-local space and lives under `root`, so it follows the model when you
reorient it; the six world-space clipping planes are re-derived each frame.

## Moving things: the transform handles

Select a part (or click a light's marker) and press **G** to move, **R** to
rotate, **S** to scale. A toolbar appears top-left of the viewport:

- **World / Local** — drag along world axes or the part's own
- **Snap** — 10 mm and 15° increments
- **Hide** (or `Esc`) — put the handles away

The **Transform** block in the Parts tab shows the same thing as numbers —
X/Y/Z position and RX/RY/RZ rotation — for when you need 600 mm exactly rather
than a drag. **Reset transform** puts the part back where it was imported.

Lights use the same handles: move places them, rotate aims them. Scale is
disabled for lights (their size is the Length/Depth sliders).

### Why moving a door does not break its hinge

Each transformable thing gets a **mount** — a Group between the scene root and
the part:

```
root
 └── mount        user placement   (the gizmo drives this)
      └── pivot   animation        (the Joint drives this)
           └── the door mesh
```

Because they are separate nodes, opening a door never undoes a move, and moving
a cabinet never disturbs its hinge — no recomputation, no drift. The mount sits
on the hinge line (or the selection's centre for unrigged parts), so the handles
appear on the part rather than out at the world origin, and "rest" is a real
position to reset to.

Parts with no motion get a *free* mount created on demand. `MountRegistry`
refuses to wrap anything that already hangs off a Joint, since re-parenting it
out of the pivot would silently break the animation.

Selecting two parts and moving them creates one shared mount, so they keep
moving together afterwards.

## Interior lights

The **Lights** tab places real light sources in the room. Pick a type, then
click the surface it shines *from* — the beam follows that surface's normal, so
clicking the underside of a wall unit gives you downward light without aiming
anything.

| Type | Use | Controls |
| --- | --- | --- |
| **Bulb** (PointLight) | pendants, open shelving | brightness, colour, range |
| **Spot** (SpotLight) | ceiling downlights, accent | brightness, cone angle, softness, range, shadows |
| **Strip** (RectAreaLight) | under-cabinet, cove, toe-kick | brightness, length, depth, colour |

- **Move** re-enters placement so you can click a new surface; or select the
  light and use the **G** / **R** handles for free positioning and aiming.
- Clicking a light's marker in the 3D view selects it.
- Markers are never included in a render, and are hidden in Play mode.
- Only spots cast shadows — point shadows need six cube faces and area lights
  cannot cast at all in three.js. Turn a spot's shadow off if it is slow.

To judge interior lighting, drop **Sun strength** and **Ambient** on the Scene
tab towards zero; the daylight presets will otherwise wash the fixtures out.

Lights hang off the scene root, so they turn with the model when you reorient
it, and they are saved with the project.

## Scene, lighting and renders

The **Scene** tab holds three groups:

- **Model orientation** — `X/Y/Z ±90°` buttons (Shift-click for −90°), a
  turntable slider and a scale slider spanning 0.001× to 1000× for files that
  came in as millimetres. The transform is applied to the scene *root*, not to
  the loaded object, so rigged doors rotate with everything else and their
  hinge axes stay valid.
- **Lighting** — four presets (Studio, Daylight, Evening, Soft box) plus direct
  control of sun direction and height, sun strength, ambient, exposure,
  background colour and shadows.
- **Render** — captures the current camera view as a PNG at 1×–4× resolution,
  optionally on a transparent background. The grid and selection outlines are
  left out of the shot.

## How the hinge actually works

Rotating a mesh in three.js rotates it around its own origin, which is almost
never where the hinge is. So when you pick an edge:

1. A `Group` (the pivot) is created at the midpoint of that edge.
2. The selected meshes are re-parented into it with `pivot.attach(obj)`, which
   preserves their world transform — nothing moves.
3. Opening the door is then just
   `pivot.quaternion.setFromAxisAngle(axis, angle)`.

Every pivot is parented directly to a `root` group that is kept at identity, so
a world-space axis measured off the model can be used verbatim as the pivot's
local axis — no basis conversions, no accumulated error. Deleting a motion
re-attaches the meshes to their original parents.

Drawers use the same pivot, translating along the picked face normal instead.

### Edge picking

`EdgesGeometry` gives the *hard* edges of the selected geometry (coplanar
triangle seams removed), and the cursor ray is tested against each segment with
a ray↔segment closest-distance solve. Ranking is by **angular** distance
(world distance ÷ depth), so a near edge and a far edge feel equally easy to
hit.

Messy geometry (dense IFC meshes, triangulated FBX) can produce thousands of
useless edges — tick **Snap to bounding-box edges** to reduce the candidates to
the 12 edges of the part's bounding box.

### Which way does it open?

The rotation sign is chosen so the part swings **toward the camera**, since you
are looking at the front of the unit when you set the hinge. When that guess is
wrong, **Flip** fixes it.

---

## Saving

Rigs autosave to `localStorage` per model, and **Export rig** writes a JSON file:

```json
{
  "format": "kitchen-motion-rig",
  "version": 1,
  "source": "kitchen.ifc",
  "joints": [
    {
      "id": "j1",
      "type": "hinge",
      "name": "Tall door",
      "sids": ["3.2"],
      "origin": [1.54, 0.72, 0.29],
      "axis": [0, 1, 0],
      "min": 0,
      "max": 95,
      "value": 0
    }
  ]
}
```

The same file also carries `materials`, `groups`, `placements`, `lights`,
`hidden`, `lighting`, `transform` and `section`, so a saved project restores the
whole look, not just the kinematics. Each joint additionally stores its `mount`
transform.

`sids` are stable hierarchy paths (child index from the model root) captured at
load time, so a rig re-attaches to the same file later. Exporting to GLB from
here carries each `sid` through in the node's `extras`, and a file that brings
its own ids keeps them instead of being renumbered — which is what lets a rig
made against an OBJ drive the GLB exported from it. Ids still do **not** survive
re-exporting from CAD with a different node order; for that you would key on IFC
GlobalIds or glTF node names instead.

Only `sid`, `selectionRoot` and `bakedTransform` cross the file boundary. The
rest of `userData` is live scene state — geometry, materials, the joint itself —
and is stripped on the way out and ignored on the way in, because glTF `extras`
would otherwise carry a JSON husk of a `BufferGeometry` back in and break the
mesh it landed on.

`bakedTransform` records the orientation the export baked into the file. The GLB
stands upright on its own for Quick Look and other viewers; opening it here with
its rig flattens that matrix again first, so joint origins are read in the same
frame they were authored in.

---

## Files

```
index.html      shell + import map (this is where CDN versions are pinned)
server.mjs      zero-dependency static server
src/
  main.js       app wiring: modes, tools, click handling, x-ray, persistence
  viewer.js     scene, camera, lights, render loop, framing
  loaders.js    format dispatch + the IFC → three.js converter
  picking.js    edge extraction and ray↔segment edge picking
  motion.js     Joint / Rig — the pivot mechanics and serialisation
  materials.js  procedural texture library, UV projection, assignment
  lights.js     placeable interior lights (bulb / spot / strip) + markers
  clipbox.js    the section box — draggable faces, clipping planes
  watermark.js  corner logo, re-tinted and composited into renders
  gizmo.js      TransformControls wrapper (move / rotate / scale)
  transforms.js free mounts — per-element placement for unrigged parts
  groups.js     named sets of parts that move together
  history.js    snapshot undo/redo
  vr.js         WebXR session, controllers, locomotion
  ar.js         WebXR AR — hit-test placement, overlay controls
  studio.js     lighting presets, model transform, render capture
  panels.js     Material, Lights and Scene tab wiring
  demo.js       the parametric demo kitchen
  ui.js         Parts tab — selection readout and the motion list
  style.css
```

---

## Turning this into a platform

What exists is the editor — the hard part. To make it multi-user you would add:

- **Storage & accounts** — models in object storage (S3/R2), rigs in Postgres
  keyed by `(user, model)`. The rig JSON above is already the API payload.
- **Server-side conversion** — IFC and FBX are slow and big in the browser.
  Convert once on upload to glTF/GLB (IfcOpenShell, FBX2glTF) and serve that;
  keep the original for re-export. This also gets you Draco/meshopt compression.
- **Share links** — a read-only Play-mode route (`/v/:id`) is a small change: load
  model + rig, hide the Rig tab. That is usually the feature customers actually
  pay for.
- **More joint types** — bi-fold, lift-up with gas strut, corner carousel,
  sliding pocket doors. Each is a `type` in `motion.js` plus a creation flow.
- **Collision / clearance checks** — "does this door hit the island at 90°" is a
  genuinely valuable answer and is cheap once every part has a real axis.

### Known limits

- Needs the CDN on first load. To go offline, `npm i three web-ifc`, repoint the
  import map at `./node_modules/…`, and set `IFC_WASM_PATH` in `src/loaders.js`
  to a local copy of `web-ifc.wasm`.
- Very large IFC models parse on the main thread and will freeze the tab for a
  few seconds. A worker is the fix.
- glTF files with Draco compression need `DRACOLoader` wired into `loaders.js`.
- Materials use an image-based library but no environment map, so metals read
  as flat-ish. Adding a small HDRI (or `RoomEnvironment`) would fix reflections.
- UV re-projection rewrites geometry as non-indexed, which raises the vertex
  count. Meshes above 300k vertices are skipped rather than re-projected.
- There is no global illumination, so light does not bounce — a spot lights
  what it points at and nothing else. Raising **Ambient** slightly fakes the
  bounce.

### Three gotchas worth remembering

`THREE.SpotLight` and `THREE.DirectionalLight` default their `position` to
`(0, 1, 0)`, not the origin. Placing a spot by setting only its parent's
position puts the light one unit above where you meant — `lights.js` zeroes it
explicitly.

`TransformControls` stopped being an `Object3D` in three r166. You now add
`controls.getHelper()` to the scene rather than the controls themselves;
`gizmo.js` handles both shapes.

`Box3.setFromObject` expands to include **every** descendant, including empty
groups sitting at the origin and helper geometry like the section-box cage. Used
naively it silently drags automatic grounding and camera framing off. Everything
here measures with `contentBounds()` from `transforms.js`, which skips subtrees
flagged `excludeFromBounds`.
