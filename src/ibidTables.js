// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { Nat } from '@agoric/nat';
import { assert, details as X, q } from '@agoric/assert';

import './types';

/**
 * The ibid logic relies on
 *    * JSON.stringify on an array visiting array indexes from 0 to
 *      arr.length -1 in order, and not visiting anything else.
 *    * JSON.parse of a record (a plain object) creating an object on
 *      which a getOwnPropertyNames will enumerate properties in the
 *      same order in which they appeared in the parsed JSON string.
 */
const makeReplacerIbidTable = () => {
  /** @type {Map<object, number>} */
  const ibidMap = new Map();
  let ibidCount = 0;

  return harden({
    /**
     * @param {object} obj
     */
    has(obj) {
      return ibidMap.has(obj);
    },
    /**
     * @param {object} obj
     */
    get(obj) {
      return ibidMap.get(obj);
    },
    /**
     * @param {object} obj
     */
    add(obj) {
      ibidMap.set(obj, ibidCount);
      ibidCount += 1;
    },
  });
};
harden(makeReplacerIbidTable);
export { makeReplacerIbidTable };

/**
 * @param {CyclePolicy} cyclePolicy
 */
const makeReviverIbidTable = cyclePolicy => {
  const ibids = [];
  const unfinishedIbids = new WeakSet();

  return harden({
    /**
     * @param {number} allegedIndex
     * @returns {object}
     */
    get(allegedIndex) {
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
    /**
     * @param {object} obj
     */
    register(obj) {
      ibids.push(obj);
      return obj;
    },
    /**
     * @param {object} obj
     */
    start(obj) {
      ibids.push(obj);
      unfinishedIbids.add(obj);
      return obj;
    },
    /**
     * @param {object} obj
     */
    finish(obj) {
      unfinishedIbids.delete(obj);
      return obj;
    },
  });
};
harden(makeReviverIbidTable);
export { makeReviverIbidTable };
