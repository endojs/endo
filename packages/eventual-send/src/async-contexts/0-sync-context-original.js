// Based on slide 6 of
// https://docs.google.com/presentation/d/1yw4d0ca6v2Z2Vmrnac9E9XJFlC872LDQ4GFR17QdRzk/edit#slide=id.g18e6eaa50e1_0_192

// The original __storage__ was initialized to `new Map()`, but nothing
// was ever stored into it. To make clearer that this *initial* binding
// of `__storage__` does not carry state, we initializa it to `undefined`
// instead, and adjust `get()` to compensate.

// eslint-disable-next-line no-underscore-dangle
let __storage__;

export class SyncContext {
  constructor() {
    harden(this);
  }

  run(val, cb, args = []) {
    const prev = __storage__;
    const next = new Map(__storage__);
    next.set(this, val);
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
harden(SyncContext);
