// Based on sync-context-original.js

// Implementation of SyncConext using `WeakMap` rather than `Map`.
// The only feature of `Map` that was used that is absent from `WeakMap`
// is the ability to enumerate the elements, which was used *only* to
// nest maps mirroring the nesting of scopes. This can also be done
// with a linked list of WeakMaps.

/**
 * @template V
 * @param {object} key
 * @param {V} val
 * @param {(key: object) => V|undefined} prevGet
 * @returns {(key: object) => V|undefined}
 */
const makeGet = (key, val, prevGet) => {
  const map = new WeakMap([[key, val]]);
  return k => (map.has(k) ? map.get(k) : prevGet(k));
};

// This initial value is as obviously stateless as `undefned`
// eslint-disable-next-line no-underscore-dangle
let __get__ = harden(_k => undefined);

export class SyncContext {
  run(val, cb, args = []) {
    const next = makeGet(this, val, __get__);
    const prev = __get__;
    try {
      __get__ = next;
      return cb(...args);
    } finally {
      __get__ = prev;
    }
  }

  get() {
    return __get__(this);
  }
}
harden(SyncContext);
