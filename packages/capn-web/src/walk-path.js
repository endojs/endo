/* eslint-disable no-await-in-loop -- the path walker is sequential by design */
// Walk a property path on a value (resolving promises at each step) and
// optionally invoke the result as a method/function with given arguments.
//
// Used by the push-handler to execute pipelined operations like
//   ["pipeline", id, ["foo", "bar"], [arg1, arg2]]
// which means: load the value at id, get .foo, get .bar, then call it with
// (arg1, arg2).

import harden from '@endo/harden';

/**
 * @param {unknown} root
 * @param {readonly PropertyKey[]} path
 * @param {readonly unknown[] | undefined} args
 * @returns {Promise<unknown>}
 */
export const walkPathAndCall = async (root, path, args) => {
  let cur = await root;
  if (args === undefined) {
    // Pure property descent: walk every segment.
    for (const seg of path) {
      cur = await cur;
      if (cur === null || cur === undefined) {
        throw new TypeError(
          `cannot read property ${String(seg)} of ${cur === null ? 'null' : 'undefined'}`,
        );
      }
      cur = /** @type {any} */ (cur)[seg];
    }
    return cur;
  }
  // Method or function call: descend all but the last segment for a method
  // call; descend zero segments for a function call.
  if (path.length === 0) {
    cur = await cur;
    if (typeof cur !== 'function') {
      throw new TypeError('cannot call non-function');
    }
    return /** @type {Function} */ (cur)(...args);
  }
  const target = path.slice(0, -1);
  const method = path[path.length - 1];
  for (const seg of target) {
    cur = await cur;
    if (cur === null || cur === undefined) {
      throw new TypeError(
        `cannot read property ${String(seg)} of ${cur === null ? 'null' : 'undefined'}`,
      );
    }
    cur = /** @type {any} */ (cur)[seg];
  }
  cur = await cur;
  if (cur === null || cur === undefined) {
    throw new TypeError(
      `cannot call method ${String(method)} of ${cur === null ? 'null' : 'undefined'}`,
    );
  }
  const fn = /** @type {any} */ (cur)[method];
  if (typeof fn !== 'function') {
    throw new TypeError(`property ${String(method)} is not a function`);
  }
  return fn.apply(cur, args);
};

harden(walkPathAndCall);
