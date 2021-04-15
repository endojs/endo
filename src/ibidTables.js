// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';

import './types';

/**
 * @typedef {Object} ReplacerIbidTable
 * @property {(obj: Passable) => boolean} has
 * @property {(obj: Passable) => (number | undefined)} get
 * @property {(obj: Passable) => void} leaf
 * @property {(obj: Passable) => Passable} start
 * @property {(obj: Passable, result: Encoding) => Encoding} finish
 */

/**
 * The ibid logic relies on
 *    * JSON.stringify on an array visiting array indexes from 0 to
 *      arr.length -1 in order, and not visiting anything else.
 *    * JSON.parse of a record (a plain object) creating an object on
 *      which a getOwnPropertyNames will enumerate properties in the
 *      same order in which they appeared in the parsed JSON string.
 *
 * @param {CyclePolicy} cyclePolicy
 * @returns {ReplacerIbidTable}
 */
const makeReplacerIbidTable = cyclePolicy => {
  /** @type {Map<Passable, number>} */
  const ibidMap = new Map();
  let ibidCount = 0;
  /** @type {WeakSet<Passable>} */
  const unfinishedIbids = new WeakSet();

  return harden({
    has: obj => {
      if (!ibidMap.has(obj)) {
        return false;
      }
      const index = ibidMap.get(obj);
      const inCycle = unfinishedIbids.has(obj);
      switch (cyclePolicy) {
        case 'allowCycles': {
          return true;
        }
        case 'warnOfCycles': {
          console.log(`Warning: ibid cycle at ${index}`);
          return true;
        }
        case 'forbidCycles': {
          assert(!inCycle, X`Cannot encode cycles at ${index}`, TypeError);
          return true;
        }
        case 'noIbids': {
          assert(!inCycle, X`Cannot encode cycles at ${index}`, TypeError);
          return false;
        }
        default: {
          assert.fail(
            X`Unrecognized cycle policy: ${q(cyclePolicy)}`,
            TypeError,
          );
        }
      }
    },
    get: obj => ibidMap.get(obj),
    leaf: obj => {
      ibidMap.set(obj, ibidCount);
      ibidCount += 1;
    },
    start: obj => {
      ibidMap.set(obj, ibidCount);
      ibidCount += 1;
      unfinishedIbids.add(obj);
      return obj;
    },
    finish: (obj, result) => {
      unfinishedIbids.delete(obj);
      return result;
    },
  });
};
harden(makeReplacerIbidTable);
export { makeReplacerIbidTable };

/**
 * @template T
 * @typedef {Object} ReviverIbidTable
 * @property {(allegedIndex: number) => T} get
 * @property {(obj: T) => T} leaf
 * @property {(obj: T) => T} start
 * @property {(obj: T) => T} finish
 */

/**
 * @template T
 * @param {CyclePolicy} cyclePolicy
 * @returns {ReviverIbidTable<T>}
 */
const makeReviverIbidTable = cyclePolicy => {
  if (cyclePolicy === 'noIbids') {
    return harden({
      get: _allegedIndex => {
        assert.fail(X`Ibids not accepted`, TypeError);
      },
      leaf: obj => obj,
      start: obj => obj,
      finish: obj => obj,
    });
  }

  /** @type {Passable[]} */
  const ibids = [];
  /** @type {WeakSet<Passable>} */
  const unfinishedIbids = new WeakSet();

  return harden({
    get: allegedIndex => {
      const index = Number(Nat(allegedIndex));
      assert(index < ibids.length, X`ibid out of range: ${index}`, RangeError);
      const result = ibids[index];
      if (unfinishedIbids.has(result)) {
        switch (cyclePolicy) {
          case 'allowCycles': {
            break;
          }
          case 'warnOfCycles': {
            console.log(`Warning: ibid cycle at ${index}`);
            break;
          }
          case 'forbidCycles': {
            assert.fail(X`Ibid cycle at ${q(index)}`, TypeError);
          }
          default: {
            assert.fail(
              X`Unrecognized cycle policy: ${q(cyclePolicy)}`,
              TypeError,
            );
          }
        }
      }
      return result;
    },
    leaf: obj => {
      ibids.push(obj);
      return obj;
    },
    start: obj => {
      ibids.push(obj);
      unfinishedIbids.add(obj);
      return obj;
    },
    finish: obj => {
      unfinishedIbids.delete(obj);
      return obj;
    },
  });
};
harden(makeReviverIbidTable);
export { makeReviverIbidTable };
