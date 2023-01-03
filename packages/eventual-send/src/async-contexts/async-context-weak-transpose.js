// Based on sync-context-weak-transpose.js
// and async-context-original.js

// eslint-disable-next-line no-underscore-dangle
let __keys__;

export class AsyncContext {
  #transposedMap = new WeakMap();

  run(val, cb, args = []) {
    const key = harden({});
    this.#transposedMap.set(key, val);
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
      if (this.#transposedMap.has(key)) {
        return this.#transposedMap.get(key);
      }
      keys = prevKeys;
    }
    return undefined;
  }
}
harden(AsyncContext);

// Exposed only to the internal `then` function
export const wrap = fn => {
  if (fn === undefined) {
    return undefined;
  }
  assert(typeof fn === 'function');
  const capture = __keys__;
  const wrapperFn = (...args) => {
    const prev = __keys__;
    try {
      __keys__ = capture;
      return fn(...args);
    } finally {
      __keys__ = prev;
    }
  };
  return harden(wrapperFn);
};
harden(wrap);
