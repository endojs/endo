// eslint-disable-next-line no-underscore-dangle
let __get__ = harden(_k => undefined);

export const makeSyncContext = () => {
  const key = harden({});

  return harden({
    run: (val, cb, args = []) => {
      const prev = __get__;
      try {
        __get__ = harden(k => (k === key ? val : prev(k)));
        return cb(...args);
      } finally {
        __get__ = prev;
      }
    },

    get: () => __get__(key),
  });
};
harden(makeSyncContext);
