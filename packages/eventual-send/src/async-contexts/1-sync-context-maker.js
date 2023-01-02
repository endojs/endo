// eslint-disable-next-line no-underscore-dangle
let __storage__;

export const makeSyncContext = () =>
  harden({
    run: (val, cb, args = []) => {
      const prev = __storage__;
      const next = new Map(__storage__);
      next.set(this, val);
      try {
        __storage__ = next;
        return cb(...args);
      } finally {
        __storage__ = prev;
      }
    },

    get: () => __storage__ && __storage__.get(this),
  });
harden(makeSyncContext);
