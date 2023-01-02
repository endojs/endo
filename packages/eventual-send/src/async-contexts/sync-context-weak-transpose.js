// Based on sync-context-weak-inline.js

// The transposed representation places most of the mutable state in
// the `SyncContext` instances. While `__keys__` remains a top-level mutable
// variable, the possible value of `__keys__` at any time is only an
// immutable linked list of immutable empty `key` objects.

// eslint-disable-next-line no-underscore-dangle
let __keys__;

export class SyncContext {
  #invMap = new WeakMap();

  run(val, cb, args = []) {
    const key = harden({});
    this.#invMap.set(key, val);
    const next = harden({ key, prevKeys: __keys__ });

    const prev = __keys__;
    try {
      __keys__ = next;
      return cb(...args);
    } finally {
      __keys__ = prev;
    }
  }

  get() {
    let keys = __keys__;
    while (keys !== undefined) {
      const { key, prevKeys } = keys;
      if (this.#invMap.has(key)) {
        return this.#invMap.get(key);
      }
      keys = prevKeys;
    }
    return undefined;
  }
}
harden(SyncContext);
