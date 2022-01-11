// @ts-check

import { getTag } from './helpers/passStyle-helpers.js';
import { makeTagged } from './makeTagged.js';
import { passStyleOf } from './passStyleOf.js';

const { is } = Object;
const { details: X, quote: q } = assert;

/**
 * This is the equality comparison used by JavaScript's Map and Set
 * abstractions, where NaN is the same as NaN and -0 is the same as
 * 0. Marshal serializes -0 as zero, so the semantics of our distributed
 * object system does not distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
export const sameValueZero = (x, y) => x === y || is(x, y);
harden(sameValueZero);

/**
 * Do a deep copy of the object, handling Proxies and recursion.
 * The resulting copy is guaranteed to be pure data, as well as hardened.
 * Such a hardened, pure copy cannot be used as a communications path.
 *
 * @template {OnlyData} T
 * @param {T} val input value.  NOTE: Must be hardened!
 * @returns {T} pure, hardened copy
 */
export const pureCopy = val => {
  // passStyleOf now asserts that val has no pass-by-copy cycles.
  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'bigint':
    case 'boolean':
    case 'null':
    case 'number':
    case 'string':
    case 'undefined':
    case 'symbol':
      return val;

    case 'copyRecord':
    case 'copyArray': {
      const obj = /** @type {Object} */ (val);

      // Create a new identity.
      const copy = /** @type {T} */ (passStyle === 'copyArray' ? [] : {});

      // Make a deep copy on the new identity.
      // Object.entries(obj) takes a snapshot (even if a Proxy).
      // Since we already know it is a copyRecord or copyArray, we
      // know that Object.entries is safe enough. On a copyRecord it
      // will represent all the own properties. On a copyArray it
      // will represent all the own properties except for the length.
      Object.entries(obj).forEach(([prop, value]) => {
        copy[prop] = pureCopy(value);
      });
      return harden(copy);
    }

    case 'tagged': {
      const tagged = /** @type {CopyTagged} */ (val);
      return makeTagged(getTag(tagged), pureCopy(tagged.payload));
    }

    case 'remotable':
    case 'error':
    case 'promise': {
      assert.fail(X`${q(passStyle)} in not OnlyData: ${val}`, TypeError);
    }

    default:
      assert.fail(
        X`Input value ${q(passStyle)} is not recognized as data`,
        TypeError,
      );
  }
};
harden(pureCopy);
