// Based on sync-context-weak.js

// Inlines `makeGet` since it is only used in one place for one purpose.
// This better sets us up for the transpose shown in
// sync-context-weak-transpose.js

// eslint-disable-next-line no-underscore-dangle
let __get__ = harden(_k => undefined);

export class SyncContext {
  run(val, cb, args = []) {
    const map = new WeakMap([[this, val]]);
    const prev = __get__;
    const next = k => (map.has(k) ? map.get(k) : prev(k));
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
