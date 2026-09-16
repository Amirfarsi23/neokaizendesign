const el = (id) => document.getElementById(id);

/** Right-hand panel: the joint list and selection readout. */
export class Panel {
  constructor(handlers) {
    this.h = handlers;
    this.list = el('joint-list');
    this.empty = el('joint-empty');
    this.count = el('joint-count');
    this.info = el('selection-info');
    this.btnHinge = el('btn-add-hinge');
    this.btnSlide = el('btn-add-slide');
    this._rows = new Map();
    this._activeId = null;
  }

  setSelection(text, canRig) {
    this.info.textContent = text;
    this.btnHinge.disabled = !canRig;
    this.btnSlide.disabled = !canRig;
  }

  setActive(joint) {
    this._activeId = joint?.id ?? null;
    for (const [id, row] of this._rows) row.classList.toggle('active', id === this._activeId);
  }

  /** Rebuild the whole list (cheap - a kitchen has tens of joints, not thousands). */
  render(joints, unitsPerMetre) {
    this.list.replaceChildren();
    this._rows.clear();
    this.count.textContent = String(joints.length);
    this.empty.hidden = joints.length > 0;

    for (const joint of joints) {
      const row = this._row(joint, unitsPerMetre);
      this._rows.set(joint.id, row);
      this.list.appendChild(row);
    }
    this.setActive(joints.find((j) => j.id === this._activeId));
  }

  /** Update just the numbers while an animation is running. */
  sync(joints) {
    for (const joint of joints) {
      const row = this._rows.get(joint.id);
      if (!row) continue;
      const range = row.querySelector('input[type=range]');
      if (document.activeElement !== range) range.value = String(joint.value);
      row.querySelector('.joint-val').textContent = row._format(joint.value);
    }
  }

  _row(joint, unitsPerMetre) {
    const isHinge = joint.type === 'hinge';
    const fmt = isHinge
      ? (v) => `${v.toFixed(0)}°`
      : (v) => `${(v / unitsPerMetre * 1000).toFixed(0)} mm`;

    const row = document.createElement('div');
    row.className = 'joint';
    row._format = fmt;
    row.addEventListener('pointerdown', () => this.h.onFocus?.(joint));

    const head = document.createElement('div');
    head.className = 'joint-head';

    const kind = document.createElement('span');
    kind.className = `kind ${isHinge ? 'hinge' : 'slide'}`;
    kind.textContent = isHinge ? 'hinge' : 'slide';

    const name = document.createElement('input');
    name.className = 'joint-name';
    name.value = joint.name;
    name.addEventListener('change', () => { joint.name = name.value.trim() || joint.name; });

    const del = document.createElement('button');
    del.className = 'btn tiny danger';
    del.textContent = 'Delete';
    del.title = 'Remove this motion and put the parts back';
    del.addEventListener('click', () => this.h.onDelete(joint));

    head.append(kind, name, del);

    const ctl = document.createElement('div');
    ctl.className = 'joint-ctl';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(Math.min(joint.min, joint.max));
    range.max = String(Math.max(joint.min, joint.max));
    range.step = isHinge ? '1' : String(0.002 * unitsPerMetre);
    range.value = String(joint.value);
    range.addEventListener('input', () => {
      joint.setValue(parseFloat(range.value));
      val.textContent = fmt(joint.value);
    });

    const val = document.createElement('span');
    val.className = 'joint-val';
    val.textContent = fmt(joint.value);

    ctl.append(range, val);

    const foot = document.createElement('div');
    foot.className = 'joint-foot';

    const limit = (label, key) => {
      const input = document.createElement('input');
      input.className = 'lim';
      input.type = 'number';
      input.title = label;
      input.step = isHinge ? '5' : String(0.01 * unitsPerMetre);
      input.value = String(round(joint[key], isHinge ? 1 : 4));
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) { input.value = String(joint[key]); return; }
        joint[key] = v;
        this.h.onLimits(joint);
      });
      return input;
    };

    const flip = document.createElement('button');
    flip.className = 'btn tiny';
    flip.textContent = 'Flip';
    flip.title = 'Reverse the direction of travel';
    flip.addEventListener('click', () => { joint.flip(); this.h.onLimits(joint); });

    const toggle = document.createElement('button');
    toggle.className = 'btn tiny';
    toggle.textContent = 'Test';
    toggle.addEventListener('click', () => joint.toggle());

    foot.append(limit('Closed value', 'min'), limit('Open value', 'max'), flip, toggle);

    row.append(head, ctl, foot);
    return row;
  }
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/* ------------------------------------------------------------- overlays -- */

let hintTimer;

export function hint(message, sticky = false) {
  const node = el('hint');
  clearTimeout(hintTimer);
  if (!message) { node.classList.remove('show'); return; }
  node.innerHTML = message;
  node.classList.add('show');
  if (!sticky) hintTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

export function loading(text) {
  const node = el('loading');
  if (!text) { node.hidden = true; return; }
  el('loading-text').textContent = text;
  node.hidden = false;
}

export function download(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
