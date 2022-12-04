const { details: X, quote: q } = assert;

const { getOwnPropertyDescriptors, getPrototypeOf, freeze } = Object;
const { apply, ownKeys } = Reflect;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

/**
 * TODO Consolidate with `isObject` that's currently in `@endo/marshal`
 *
 * @param {any} val
 * @returns {boolean}
 */
const isObject = val => Object(val) === val;

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified = (a, b) => {
  if (typeof a === typeof b) {
    const left = String(a);
    const right = String(b);
    // eslint-disable-next-line no-nested-ternary
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof a === 'symbol') {
    assert(typeof b === 'string');
    return -1;
  }
  assert(typeof a === 'string');
  assert(typeof b === 'symbol');
  return 1;
};

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
export const getMethodNames = val => {
  let layer = val;
  const names = new Set(); // Set to deduplicate
  while (layer !== null && layer !== Object.prototype) {
    // be tolerant of non-objects
    const descs = getOwnPropertyDescriptors(layer);
    for (const name of ownKeys(descs)) {
      // In case a method is overridden by a non-method,
      // test `val[name]` rather than `layer[name]`
      if (typeof val[name] === 'function') {
        names.add(name);
      }
    }
    if (!isObject(val)) {
      break;
    }
    layer = getPrototypeOf(layer);
  }
  return harden([...names].sort(compareStringified));
};
// The top level of the eventual send modules can be evaluated before
// ses creates `harden`, and so cannot rely on `harden` at top level.
freeze(getMethodNames);

export const localApplyFunction = (t, args) => {
  assert.typeof(
    t,
    'function',
    X`Cannot invoke target as a function; typeof target is ${q(ntypeof(t))}`,
  );
  return apply(t, undefined, args);
};

export const localApplyMethod = (t, method, args) => {
  if (method === undefined || method === null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(t, args);
  }
  if (t === undefined || t === null) {
    assert.fail(
      X`Cannot deliver ${q(method)} to target; typeof target is ${q(
        ntypeof(t),
      )}`,
      TypeError,
    );
  }
  const fn = t[method];
  if (fn === undefined) {
    assert.fail(
      X`target has no method ${q(method)}, has ${q(getMethodNames(t))}`,
      TypeError,
    );
  }
  const ftype = ntypeof(fn);
  assert.typeof(
    fn,
    'function',
    X`invoked method ${q(method)} is not a function; it is a ${q(ftype)}`,
  );
  return apply(fn, t, args);
};

export const localGet = (t, key) => t[key];
