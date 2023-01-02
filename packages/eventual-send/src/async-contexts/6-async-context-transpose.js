// eslint-disable-next-line no-underscore-dangle
let __get__ = harden(_m => undefined);

export const makeAsyncContext = () => {
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
harden(makeAsyncContext);

// Exposed only to the internal `then` function?
export const wrap = fn => {
  if (fn === undefined) {
    return undefined;
  }
  assert(typeof fn === 'function');
  const capture = __get__;
  const wrapperFn = (...args) => {
    const prev = __get__;
    try {
      __get__ = capture;
      return fn(...args);
    } finally {
      __get__ = prev;
    }
  };
  return harden(wrapperFn);
};
harden(wrap);
