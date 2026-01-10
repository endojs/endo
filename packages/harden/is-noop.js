const { getOwnPropertyDescriptor } = Object;

const memo = new WeakMap();

/**
 * Empirically determines whether the `harden` exported by `@endo/harden`
 * is a noop harden.
 * @param {<T>(object: T) => T} harden
 */
const hardenIsNoop = harden => {
  let isNoop = memo.get(harden);
  if (isNoop !== undefined) return isNoop;
  // We do not trust isFrozen because lockdown with unsafe hardenTaming replaces
  // isFrozen with a version that is in cahoots with fake harden.
  const subject = harden({ __proto__: null, x: 0 });
  const desc = getOwnPropertyDescriptor(subject, 'x');
  isNoop = desc?.writable === true;
  memo.set(harden, isNoop);
  return isNoop;
};

export default hardenIsNoop;
