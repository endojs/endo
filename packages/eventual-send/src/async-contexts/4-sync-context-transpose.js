// eslint-disable-next-line no-underscore-dangle
let __get__ = harden(_m => undefined);

export const makeSyncContext = () => {
  const transposedMap = new WeakMap();

  return harden({
    run: (val, cb, args = []) => {
      const prev = __get__;
      const key = harden({});
      transposedMap.set(key, val);
      try {
        __get__ = harden(m => (m.has(key) ? m.get(key) : prev(m)));
        return cb(...args);
      } finally {
        __get__ = prev;
      }
    },

    get: () => __get__(transposedMap),
  });
};
harden(makeSyncContext);
