// Based on sync-context-original.js and slides 11 and 13 of
// https://docs.google.com/presentation/d/1yw4d0ca6v2Z2Vmrnac9E9XJFlC872LDQ4GFR17QdRzk/edit#slide=id.g18e6eaa50e1_0_192

// See note in sync-context-original.js about initially binding `__storage__`
// to `undefined` rather than `new Map()`.
// eslint-disable-next-line no-underscore-dangle
let __storage__;

export class AsyncContext {
  run(val, cb, args = []) {
    const next = new Map(__storage__);
    next.set(this, val);
    const prev = __storage__;
    try {
      __storage__ = next;
      return cb(...args);
    } finally {
      __storage__ = prev;
    }
  }

  get() {
    return __storage__ && __storage__.get(this);
  }
}
harden(AsyncContext);

// Exposed only to the internal `then` function
export const wrap = fn => {
  if (fn === undefined) {
    return undefined;
  }
  assert(typeof fn === 'function');
  const capture = __storage__;
  const wrapperFn = (...args) => {
    const prev = __storage__;
    try {
      __storage__ = capture;
      return fn(...args);
    } finally {
      __storage__ = prev;
    }
  };
  return harden(wrapperFn);
};
harden(wrap);
