/**
 * Undo / redo.
 *
 * Snapshot-based rather than command-based: the editable state already
 * serialises to JSON for saving, so a snapshot is free and — crucially —
 * cannot drift out of sync with the real scene the way a pile of hand-written
 * inverse operations does. A kitchen's worth of state is a few KB.
 */
export class History {
  /**
   * @param {object} opts
   * @param {() => string} opts.capture  serialise the current state
   * @param {(state: string) => void} opts.apply  restore a captured state
   */
  constructor({ capture, apply, limit = 50, onChange = () => {} }) {
    this.capture = capture;
    this.apply = apply;
    this.limit = limit;
    this.onChange = onChange;

    this.past = [];
    this.future = [];
    this.current = null;
    this.suspended = false;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  /** Start fresh — call after loading a model. */
  reset() {
    this.past = [];
    this.future = [];
    this.current = this.capture();
    this.onChange(this);
  }

  /**
   * Record that something changed. `label` is what the user will be told they
   * undid, so phrase it as a past-tense thing that happened.
   */
  commit(label = 'change') {
    if (this.suspended) return;

    const next = this.capture();
    if (next === this.current) return;          // nothing actually moved

    if (this.current !== null) {
      this.past.push({ state: this.current, label });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = next;
    this.future.length = 0;
    this.onChange(this);
  }

  undo() {
    if (!this.canUndo) return null;
    const entry = this.past.pop();
    this.future.push({ state: this.current, label: entry.label });
    this._restore(entry.state);
    return entry.label;
  }

  redo() {
    if (!this.canRedo) return null;
    const entry = this.future.pop();
    this.past.push({ state: this.current, label: entry.label });
    this._restore(entry.state);
    return entry.label;
  }

  _restore(state) {
    this.suspended = true;
    try {
      this.apply(state);
      this.current = state;
    } finally {
      this.suspended = false;
    }
    this.onChange(this);
  }

  /** Run `fn` without recording anything it does. */
  silently(fn) {
    const was = this.suspended;
    this.suspended = true;
    try { return fn(); } finally { this.suspended = was; }
  }
}
