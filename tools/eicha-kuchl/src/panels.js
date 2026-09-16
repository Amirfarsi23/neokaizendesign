import * as THREE from 'three';
import {
  LIBRARY, CATEGORIES, swatchUrl, buildMaterial,
  assign, restore, customFromFile
} from './materials.js';
import { LIGHT_PRESETS } from './studio.js';

const $ = (id) => document.getElementById(id);

/** Stable ids of every mesh under these objects. */
function collectSids(objects) {
  const sids = [];
  for (const object of objects) {
    object.traverse((mesh) => {
      if (mesh.isMesh && mesh.userData.sid !== undefined) sids.push(mesh.userData.sid);
    });
  }
  return sids;
}

/* ---------------------------------------------------------------- tabs -- */

export function initTabs() {
  const bar = $('panel-tabs');
  bar.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    for (const t of bar.children) t.classList.toggle('active', t === tab);
    for (const body of document.querySelectorAll('.pane-body')) {
      body.hidden = body.dataset.pane !== tab.dataset.tab;
    }
  });
}

export function showTab(name) {
  $('panel-tabs').querySelector(`.tab[data-tab="${name}"]`)?.click();
}

/* ------------------------------------------------------------ material -- */

export class MaterialPanel {
  /**
   * @param {object} ctx { viewer, getSelection, getRoot, getUnitsPerMetre, hint }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.custom = [];
    this.current = null;           // { material, def, group }
    this.groups = [];              // persisted assignments, newest last
    this.settings = { size: 1.4, rotation: 0, roughness: 0.6, metalness: 0, tint: '#ffffff' };

    this._buildCategories();
    this._bind();
    this.renderSwatches();
  }

  _buildCategories() {
    const select = $('mat-category');
    select.replaceChildren();
    for (const name of [...CATEGORIES, 'Custom']) {
      const option = document.createElement('option');
      option.value = option.textContent = name;
      select.appendChild(option);
    }
    select.value = 'Wood';
  }

  _bind() {
    $('mat-category').addEventListener('change', () => this.renderSwatches());

    const slider = (id, key, format, transform = (v) => v) => {
      const input = $(id);
      const label = $(`${id}-val`);
      input.addEventListener('input', () => {
        this.settings[key] = transform(parseFloat(input.value));
        label.textContent = format(this.settings[key]);
        this.refresh();
      });
    };

    slider('mat-size', 'size', (v) => `${v.toFixed(2)} m`);
    slider('mat-rot', 'rotation', (v) => `${v.toFixed(0)}°`);
    slider('mat-rough', 'roughness', (v) => v.toFixed(2));
    slider('mat-metal', 'metalness', (v) => v.toFixed(2));

    $('mat-tint').addEventListener('input', (e) => {
      this.settings.tint = e.target.value;
      this.refresh();
    });

    $('btn-upload-tex').addEventListener('click', () => $('tex-input').click());
    $('tex-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const def = await customFromFile(file);
        this.custom = [def, ...this.custom.filter((d) => d.id !== def.id)];
        $('mat-category').value = 'Custom';
        this.renderSwatches();
        this.apply(def);
      } catch (err) {
        this.ctx.hint(`Could not read that image: ${err.message}`);
      }
    });

    $('btn-mat-reset').addEventListener('click', () => {
      const objects = this.ctx.getSelection();
      if (!objects.length) return this.ctx.hint('Select something first');
      const n = restore(objects);
      const sids = collectSids(objects);
      this.forget(sids);
      this.current = null;
      this.setCurrentLabel(null);
      this.ctx.onChange?.();
      this.ctx.hint(n ? `Restored ${n} original material${n === 1 ? '' : 's'}` : 'Nothing to restore');
    });
  }

  entries() {
    const category = $('mat-category').value;
    return category === 'Custom' ? this.custom : LIBRARY.filter((d) => d.category === category);
  }

  renderSwatches() {
    const grid = $('swatch-grid');
    grid.replaceChildren();
    const entries = this.entries();

    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'muted small';
      empty.textContent = 'No images uploaded yet.';
      grid.appendChild(empty);
      return;
    }

    for (const def of entries) {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.title = def.name;
      button.dataset.id = def.id;
      if (this.current?.def.id === def.id) button.classList.add('active');

      const img = document.createElement('img');
      img.src = def.image ? def.image.toDataURL('image/png') : swatchUrl(def);
      img.alt = def.name;

      const caption = document.createElement('span');
      caption.textContent = def.name;

      button.append(img, caption);
      button.addEventListener('click', () => this.apply(def));
      grid.appendChild(button);
    }
  }

  /** Push the library entry's own defaults into the sliders. */
  adoptDefaults(def) {
    this.settings.size = def.size ?? 1;
    this.settings.roughness = def.roughness ?? 0.6;
    this.settings.metalness = def.metalness ?? 0;
    this.syncInputs();
  }

  syncInputs() {
    const { size, rotation, roughness, metalness, tint } = this.settings;
    $('mat-size').value = size;
    $('mat-size-val').textContent = `${size.toFixed(2)} m`;
    $('mat-rot').value = rotation;
    $('mat-rot-val').textContent = `${rotation.toFixed(0)}°`;
    $('mat-rough').value = roughness;
    $('mat-rough-val').textContent = roughness.toFixed(2);
    $('mat-metal').value = metalness;
    $('mat-metal-val').textContent = metalness.toFixed(2);
    $('mat-tint').value = tint;
  }

  setCurrentLabel(def) {
    $('mat-current').textContent = def ? def.name : 'none';
  }

  apply(def) {
    const objects = this.ctx.getSelection();
    if (!objects.length) {
      this.ctx.hint('Select a part first, then pick a material');
      return;
    }

    this.adoptDefaults(def);

    const material = buildMaterial(def, {
      ...this.settings,
      unitsPerMetre: this.ctx.getUnitsPerMetre()
    }, this.ctx.viewer.renderer.capabilities.getMaxAnisotropy());

    const count = assign(objects, material, this.ctx.getRoot());
    const group = this.track(def, objects, material);
    this.current = { material, def, group };
    this.setCurrentLabel(def);
    this.renderSwatches();
    this.ctx.onChange?.();
    this.ctx.hint(`<b>${def.name}</b> applied to ${count} mesh${count === 1 ? '' : 'es'}`);
  }

  /** Live-edit the material already on the selection. */
  refresh() {
    const material = this.current?.material;
    if (!material) return;

    const { size, rotation, roughness, metalness, tint } = this.settings;
    const repeat = 1 / Math.max(size * this.ctx.getUnitsPerMetre(), 1e-4);
    const radians = THREE.MathUtils.degToRad(rotation);

    for (const map of [material.map, material.normalMap]) {
      if (!map) continue;
      map.repeat.setScalar(repeat);
      map.rotation = radians;
      map.needsUpdate = true;
    }
    material.color.set(tint);
    material.roughness = roughness;
    material.metalness = metalness;
    material.needsUpdate = true;

    if (this.current.group) {
      Object.assign(this.current.group.settings, this.settings);
      this.ctx.onChange?.();
    }
  }

  /* ------------------------------------------------------- persistence -- */

  track(def, objects, material) {
    const sids = collectSids(objects);
    this.forget(sids);
    const group = { defId: def.id, settings: { ...this.settings }, sids, material };
    this.groups.push(group);
    return group;
  }

  /** Drop these meshes from any earlier assignment - one material per mesh. */
  forget(sids) {
    const drop = new Set(sids);
    for (const group of this.groups) group.sids = group.sids.filter((s) => !drop.has(s));
    this.groups = this.groups.filter((g) => g.sids.length);
  }

  reset() {
    this.groups = [];
    this.current = null;
    this.setCurrentLabel(null);
    this.renderSwatches();
  }

  toJSON() {
    // uploaded images are not serialised - they would bloat the save file
    return this.groups
      .filter((g) => !g.defId.startsWith('custom:'))
      .map(({ defId, settings, sids }) => ({ defId, settings, sids }));
  }

  fromJSON(list, index) {
    // clear every assignment first, so a snapshot without a material actually
    // removes the one that is on the mesh now
    restore([this.ctx.getRoot()]);
    this.groups = [];
    let applied = 0;
    for (const entry of list ?? []) {
      const def = LIBRARY.find((d) => d.id === entry.defId);
      if (!def) continue;
      const objects = entry.sids.map((s) => index.get(s)).filter(Boolean);
      if (!objects.length) continue;

      const settings = { size: def.size, rotation: 0, roughness: def.roughness,
                         metalness: def.metalness, tint: '#ffffff', ...entry.settings };
      const material = buildMaterial(def, {
        ...settings,
        unitsPerMetre: this.ctx.getUnitsPerMetre()
      }, this.ctx.viewer.renderer.capabilities.getMaxAnisotropy());

      assign(objects, material, this.ctx.getRoot());
      this.groups.push({ defId: def.id, settings, sids: entry.sids, material });
      applied++;
    }
    this.current = null;
    this.setCurrentLabel(null);
    this.renderSwatches();
    return applied;
  }

  /**
   * When the selection changes, adopt whatever material it already carries so
   * the sliders edit that instead of silently doing nothing.
   */
  onSelectionChanged(objects) {
    let found = null;
    for (const object of objects) {
      object.traverse((mesh) => {
        if (found || !mesh.isMesh) return;
        const id = mesh.material?.userData?.libraryId;
        if (id) {
          const def = [...LIBRARY, ...this.custom].find((d) => d.id === id);
          if (def) found = { material: mesh.material, def };
        }
      });
      if (found) break;
    }
    this.current = found
      ? { ...found, group: this.groups.find((g) => g.material === found.material) ?? null }
      : null;
    this.setCurrentLabel(found?.def ?? null);
    if (found) {
      this.settings.roughness = found.material.roughness;
      this.settings.metalness = found.material.metalness;
      this.settings.tint = `#${found.material.color.getHexString()}`;
      const repeat = found.material.map?.repeat.x ?? 1;
      this.settings.size = 1 / (repeat * this.ctx.getUnitsPerMetre());
      this.settings.rotation = THREE.MathUtils.radToDeg(found.material.map?.rotation ?? 0);
      this.syncInputs();
    }
    this.renderSwatches();
  }
}

/* --------------------------------------------------------------- scene -- */

export class ScenePanel {
  /** @param {object} ctx { studio, viewer, hint, download } */
  constructor(ctx) {
    this.ctx = ctx;
    this._buildPresets();
    this._bindTransform();
    this._bindLighting();
    this._bindRender();
  }

  _buildPresets() {
    const select = $('light-preset');
    select.replaceChildren();
    for (const [key, preset] of Object.entries(LIGHT_PRESETS)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = preset.label;
      select.appendChild(option);
    }
    select.value = this.ctx.studio.lighting.preset;
  }

  _bindTransform() {
    const studio = this.ctx.studio;

    for (const button of document.querySelectorAll('[data-rot]')) {
      button.addEventListener('click', (e) => {
        const step = e.shiftKey ? -90 : 90;
        const t = studio.nudge(button.dataset.rot, step);
        this.syncTransform(t);
        this.ctx.onChange?.();
        this.ctx.hint(`Rotated ${button.dataset.rot.toUpperCase()} by ${step}°`);
      });
    }

    $('btn-rot-reset').addEventListener('click', () => {
      this.syncTransform(studio.resetTransform());
      this.ctx.onChange?.();
    });

    $('rot-y').addEventListener('input', (e) => {
      const t = studio.setTransform({ ry: parseFloat(e.target.value) });
      $('rot-y-val').textContent = `${t.ry.toFixed(0)}°`;
    });

    $('model-scale').addEventListener('input', (e) => {
      const scale = Math.pow(10, parseFloat(e.target.value));
      studio.setTransform({ scale });
      $('scale-val').textContent = scale < 0.1 ? `${scale.toFixed(3)}×` : `${scale.toFixed(2)}×`;
    });
  }

  syncTransform(t) {
    $('rot-y').value = ((t.ry % 360) + 360) % 360;
    $('rot-y-val').textContent = `${$('rot-y').value}°`;
    $('model-scale').value = Math.log10(t.scale);
    $('scale-val').textContent = t.scale < 0.1 ? `${t.scale.toFixed(3)}×` : `${t.scale.toFixed(2)}×`;
  }

  _bindLighting() {
    const studio = this.ctx.studio;

    $('light-preset').addEventListener('change', (e) => {
      this.syncLighting(studio.usePreset(e.target.value));
    });

    const slider = (id, key, format) => {
      $(id).addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        studio.setLighting({ [key]: value });
        $(`${id}-val`).textContent = format(value);
      });
    };

    slider('azimuth', 'azimuth', (v) => `${v.toFixed(0)}°`);
    slider('elevation', 'elevation', (v) => `${v.toFixed(0)}°`);
    slider('sun', 'sun', (v) => v.toFixed(2));
    slider('ambient', 'ambient', (v) => v.toFixed(2));
    slider('exposure', 'exposure', (v) => v.toFixed(2));

    $('background').addEventListener('input', (e) =>
      studio.setLighting({ background: e.target.value }));

    // commit once the drag ends rather than on every pixel of slider movement
    for (const id of ['azimuth', 'elevation', 'sun', 'ambient', 'exposure',
                      'background', 'rot-y', 'model-scale']) {
      $(id).addEventListener('change', () => this.ctx.onChange?.());
    }

    $('chk-shadows').addEventListener('change', (e) => {
      studio.setLighting({ shadows: e.target.checked });
      this.ctx.onChange?.();
    });
  }

  syncLighting(l) {
    $('light-preset').value = l.preset;
    const set = (id, value, format) => {
      $(id).value = value;
      $(`${id}-val`).textContent = format(value);
    };
    set('azimuth', l.azimuth, (v) => `${v.toFixed(0)}°`);
    set('elevation', l.elevation, (v) => `${v.toFixed(0)}°`);
    set('sun', l.sun, (v) => v.toFixed(2));
    set('ambient', l.ambient, (v) => v.toFixed(2));
    set('exposure', l.exposure, (v) => v.toFixed(2));
    $('background').value = l.background;
    $('chk-shadows').checked = l.shadows;
  }

  _bindRender() {
    $('btn-render').addEventListener('click', async () => {
      const button = $('btn-render');
      button.disabled = true;
      button.textContent = 'Rendering…';
      try {
        const { blob, width, height } = await this.ctx.studio.capture({
          multiplier: Number($('render-scale').value),
          transparent: $('chk-transparent').checked,
          watermark: this.ctx.watermark
        });
        if (!blob) throw new Error('the canvas returned no image');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.ctx.download(`render-${stamp}.png`, blob);
        $('render-info').textContent = `Saved ${width} × ${height} px.`;
      } catch (err) {
        this.ctx.hint(`Capture failed: ${err.message}`);
      } finally {
        button.disabled = false;
        button.textContent = 'Capture PNG';
      }
    });
  }
}

/* -------------------------------------------------------------- lights -- */

export class LightsPanel {
  /** @param {object} ctx { rig: LightRig, hint, onPlace, onSelect } */
  constructor(ctx) {
    this.ctx = ctx;
    this.activeId = null;
    this._rows = new Map();
    this._bind();
  }

  _bind() {
    for (const button of document.querySelectorAll('[data-light]')) {
      button.addEventListener('click', () => {
        for (const b of document.querySelectorAll('[data-light]')) {
          b.classList.toggle('toggled', b === button);
        }
        this.ctx.onPlace(button.dataset.light);
      });
    }

    $('chk-light-markers').addEventListener('change', (e) => {
      this.ctx.rig.setMarkersVisible(e.target.checked);
    });
  }

  clearPlacementState() {
    for (const b of document.querySelectorAll('[data-light]')) b.classList.remove('toggled');
  }

  setActive(entry) {
    this.activeId = entry?.id ?? null;
    for (const [id, row] of this._rows) row.classList.toggle('active', id === this.activeId);
    this.ctx.rig.highlight(entry ?? null);
  }

  render() {
    const list = $('light-list');
    list.replaceChildren();
    this._rows.clear();

    const lights = this.ctx.rig.lights;
    $('light-count').textContent = String(lights.length);
    $('light-empty').hidden = lights.length > 0;

    for (const entry of lights) list.appendChild(this._row(entry));
    this.setActive(lights.find((l) => l.id === this.activeId) ?? null);
  }

  _row(entry) {
    const rig = this.ctx.rig;
    const row = document.createElement('div');
    row.className = 'joint';
    row.addEventListener('pointerdown', () => this.setActive(entry));
    this._rows.set(entry.id, row);

    const head = document.createElement('div');
    head.className = 'joint-head';

    const kind = document.createElement('span');
    kind.className = 'kind slide';
    kind.textContent = entry.type;

    const name = document.createElement('input');
    name.className = 'joint-name';
    name.value = entry.name;
    name.addEventListener('change', () => {
      entry.name = name.value.trim() || entry.name;
      this.ctx.onChange?.();
    });

    const del = document.createElement('button');
    del.className = 'btn tiny danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      rig.remove(entry);
      this.ctx.hint(`Removed <b>${entry.name}</b>`);
    });

    head.append(kind, name, del);
    row.appendChild(head);

    const slider = (label, key, min, max, step, format) => {
      const wrap = document.createElement('label');
      wrap.className = 'ctl';
      const caption = document.createElement('span');
      const text = document.createElement('b');
      text.textContent = label;
      text.style.fontWeight = '400';
      const value = document.createElement('i');
      value.textContent = format(entry[key]);
      caption.append(text, value);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step;
      input.value = entry[key];
      input.addEventListener('input', () => {
        entry[key] = parseFloat(input.value);
        value.textContent = format(entry[key]);
        rig.apply(entry);
      });
      input.addEventListener('change', () => this.ctx.onChange?.());

      wrap.append(caption, input);
      row.appendChild(wrap);
    };

    slider('Brightness', 'intensity', 0, entry.type === 'strip' ? 60 : 300, 0.5, (v) => v.toFixed(0));

    if (entry.type === 'spot') {
      slider('Cone angle', 'angle', 5, 80, 1, (v) => `${v.toFixed(0)}°`);
      slider('Softness', 'penumbra', 0, 1, 0.01, (v) => v.toFixed(2));
    }
    if (entry.type === 'strip') {
      slider('Length', 'width', 0.05, 4, 0.01, (v) => `${v.toFixed(2)} m`);
      slider('Depth', 'height', 0.01, 1, 0.01, (v) => `${v.toFixed(2)} m`);
    }
    if (entry.type !== 'strip') {
      slider('Range', 'distance', 0, 20, 0.1, (v) => (v === 0 ? 'unlimited' : `${v.toFixed(1)} m`));
    }

    const foot = document.createElement('div');
    foot.className = 'joint-foot';

    const colour = document.createElement('input');
    colour.type = 'color';
    colour.value = entry.color;
    colour.title = 'Light colour';
    colour.addEventListener('input', () => {
      entry.color = colour.value;
      rig.apply(entry);
      if (this.activeId !== entry.id) rig.highlight(null);
    });
    colour.addEventListener('change', () => this.ctx.onChange?.());
    foot.appendChild(colour);

    if (entry.type === 'spot') {
      const shadow = document.createElement('label');
      shadow.className = 'check small';
      shadow.style.margin = '0';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = entry.castShadow;
      box.addEventListener('change', () => {
        entry.castShadow = box.checked;
        rig.apply(entry);
        this.ctx.onChange?.();
      });
      shadow.append(box, document.createTextNode('Shadow'));
      foot.appendChild(shadow);
    }

    const move = document.createElement('button');
    move.className = 'btn tiny';
    move.textContent = 'Move';
    move.title = 'Click a new surface to move this light there';
    move.addEventListener('click', () => {
      this.setActive(entry);
      this.ctx.onPlace(entry.type, entry);
    });
    foot.appendChild(move);

    row.appendChild(foot);
    return row;
  }
}


/* -------------------------------------------------------------- groups -- */

export class GroupsPanel {
  /** @param {object} ctx { registry, hint, onSelect, onChange } */
  constructor(ctx) {
    this.ctx = ctx;
  }

  render() {
    const pane = $('groups-pane');
    const list = $('group-list');
    const groups = this.ctx.registry.groups;

    $('group-count').textContent = String(groups.length);
    pane.hidden = groups.length === 0;
    list.replaceChildren();

    for (const group of groups) {
      const row = document.createElement('div');
      row.className = 'joint';

      const head = document.createElement('div');
      head.className = 'joint-head';

      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = `${group.objects.length}`;

      const name = document.createElement('input');
      name.className = 'joint-name';
      name.value = group.name;
      name.addEventListener('change', () => {
        group.name = name.value.trim() || group.name;
        this.ctx.onChange?.();
      });

      const select = document.createElement('button');
      select.className = 'btn tiny';
      select.textContent = 'Select';
      select.addEventListener('click', () => this.ctx.onSelect(group));

      const ungroup = document.createElement('button');
      ungroup.className = 'btn tiny danger';
      ungroup.textContent = 'Ungroup';
      ungroup.addEventListener('click', () => {
        this.ctx.registry.remove(group);
        this.ctx.hint(`Ungrouped <b>${group.name}</b>`);
      });

      head.append(kind, name, select, ungroup);
      row.appendChild(head);
      list.appendChild(row);
    }
  }
}
