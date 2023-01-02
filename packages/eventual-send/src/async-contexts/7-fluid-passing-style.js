// @ts-nocheck
/* eslint-disable no-underscore-dangle */
// Given that the post-fps language has its own hidden
// WeakMap, harden, undefined, assert

// eslint-disable-next-line no-unused-vars
export const _makeAsyncContext = F1 => {
  const transposedMap = new WeakMap();

  return harden({
    run: (F2, _val, _cb, _args = []) => {
      const key = harden({});
      transposedMap.set(key, _val);
      const F3 = harden(m => (m.has(key) ? m.get(key) : F2(m)));
      return _cb(F3, ..._args); // No try!
    },
    get: F4 => F4(transposedMap),
  });
};
harden(_makeAsyncContext);

// Exposed only to the internal `then` function?
export const _wrap = (F5, _fn) => {
  if (_fn === undefined) {
    return undefined;
  }
  assert(typeof _fn === 'function');
  // eslint-disable-next-line no-unused-vars
  const _wrapper = (F6, ...args) => {
    return _fn(F5, ...args);
  };
  return harden(_wrapper);
};
harden(_wrap);
