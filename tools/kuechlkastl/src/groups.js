/**
 * Named groups of parts — a chair's legs plus its seat, a cabinet plus its
 * plinth. Clicking any member selects the whole group, and the transform
 * handles then move or rotate all of it as one rigid thing.
 *
 * A group is bookkeeping, not hierarchy: membership is tagged on the objects
 * and the shared mount that MountRegistry builds does the actual moving. That
 * keeps grouping independent of rigging, so a group can contain rigged doors.
 */

let nextId = 1;

export class GroupRegistry {
  constructor() {
    this.groups = [];
    this.onChange = () => {};
  }

  clear() {
    for (const group of this.groups) {
      for (const object of group.objects) delete object.userData.groupId;
    }
    this.groups = [];
    this.onChange();
  }

  /**
   * @param {THREE.Object3D[]} objects
   * @returns the new group, or null if there was nothing to group
   */
  create(objects, name) {
    const members = dedupe(objects);
    if (members.length < 2) return null;

    // a part can only belong to one group — pull it out of any earlier one
    for (const object of members) {
      const previous = this.byId(object.userData.groupId);
      if (previous) this.remove(previous, { quiet: true });
    }

    const group = {
      id: `g${nextId++}`,
      name: name || defaultName(members),
      objects: members
    };
    for (const object of members) object.userData.groupId = group.id;

    this.groups.push(group);
    this.onChange();
    return group;
  }

  remove(group, { quiet = false } = {}) {
    if (!group) return;
    for (const object of group.objects) {
      if (object.userData.groupId === group.id) delete object.userData.groupId;
    }
    this.groups = this.groups.filter((g) => g !== group);
    if (!quiet) this.onChange();
  }

  byId(id) {
    return id ? this.groups.find((g) => g.id === id) ?? null : null;
  }

  /** The group an object (or any of its ancestors) belongs to. */
  groupOf(object) {
    for (let o = object; o; o = o.parent) {
      const group = this.byId(o.userData.groupId);
      if (group) return group;
    }
    return null;
  }

  toJSON() {
    return this.groups.map((g) => ({
      id: g.id,
      name: g.name,
      sids: g.objects.map((o) => o.userData.sid).filter((s) => s !== undefined)
    }));
  }

  fromJSON(list, index) {
    this.clear();
    for (const raw of list ?? []) {
      const objects = (raw.sids ?? []).map((s) => index.get(s)).filter(Boolean);
      if (objects.length < 2) continue;
      const group = { id: raw.id ?? `g${nextId++}`, name: raw.name, objects };
      for (const object of objects) object.userData.groupId = group.id;
      this.groups.push(group);
    }
    this.onChange();
    return this.groups.length;
  }
}

function dedupe(objects) {
  const seen = new Set();
  return objects.filter((o) => {
    if (seen.has(o)) return false;
    seen.add(o);
    return true;
  });
}

function defaultName(members) {
  const first = members[0]?.name?.trim();
  return first ? `${first} +${members.length - 1}` : `Group of ${members.length}`;
}
