const { details: X, quote: q } = assert;

const { getOwnPropertyDescriptors } = Object;
const { apply, ownKeys } = Reflect;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

/**
 * @template T
 * @typedef {[boolean, T]} PriorityValue
 */

/**
 * Compare two pairs of priority + string.
 *
 * @template T
 * @param {PriorityValue<T>} param0
 * @param {PriorityValue<T>} param1
 * @returns {-1 | 0 | 1}
 */
export const priorityValueCompare = (
  [aIsPriority, aValue],
  [bIsPriority, bValue],
) => {
  if (aIsPriority && !bIsPriority) {
    return -1;
  }
  if (!aIsPriority && bIsPriority) {
    return 1;
  }

  // Same priority, so compare by value.
  if (aValue < bValue) {
    return -1;
  }
  if (aValue > bValue) {
    return 1;
  }
  return 0;
};

/**
 * Return an ordered array of own keys of a value.
 *
 * @todo This is only useful as a diagnostic if we don't have prototype
 * inheritance.
 * @param {any} specimen value to get ownKeys of
 */
export const sortedOwnKeys = specimen => {
  /**
   * Get the own keys of the specimen, no matter what type it is.  We don't want
   * `ownKeys` to fail on non-objects.
   *
   * @type {(string | number | symbol)[]}
   */
  const keys = ownKeys(getOwnPropertyDescriptors(specimen));

  /**
   * Symbols are higher priority than strings, regardless of stringification.
   *
   * @type {PriorityValue<string>[]}
   */
  const priorityValues = keys.map(key => [
    typeof key === 'symbol',
    String(key),
  ]);

  /**
   * Get the sorted-by-priorityValue indices into the keys array.
   *
   * @type {number[]}
   */
  const sortedIndices = new Array(priorityValues.length);
  for (let i = 0; i < priorityValues.length; i += 1) {
    sortedIndices[i] = i;
  }
  sortedIndices.sort((ai, bi) =>
    priorityValueCompare(priorityValues[ai], priorityValues[bi]),
  );

  /**
   * Return the sorted keys.
   *
   * @type {(string | symbol)[]}
   */
  return sortedIndices.map(i => keys[i]);
};

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
      X`target has no method ${q(method)}, has ${q(sortedOwnKeys(t))}`,
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
