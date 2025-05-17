import { makeFullOrderComparatorKit } from '../src/rankOrder.js';

// TODO once we're on the other side of this transition, migrate all importers
// of `testFullOrderEQ` from `@agoric/internal/tools/ava-full-order-eq.js`
// to import instead from `@endo/marshal/tools/ava-full-order-eq.js

/**
 * @import {Passable} from '@endo/pass-style';
 */

/**
 * We often used `t.deepEqual` to compare whether two Passables are the same in
 * our distributed object semantics. This was never correct, but worked well
 * enough until https://github.com/endojs/endo/pull/2777 when Passable symbols
 * that were not `t.deepEqual` could still be equal in our distributed object
 * semantics. For at least those cases, switch from
 *
 * ```js
 * t.deepEqual(specimen, expected, message?)
 * ```
 *
 * to
 *
 * ```js
 * testFullOrderEQ(t, specimen, expected, message?)
 * ```
 *
 * Even aside from symbols, this is not quite testing the same thing. In our
 * distributed object semantics, neither promises nor errors have comparable
 * equality. All promises and of the same rank, and all errors are of the same
 * rank. `compareFull` differs from `compareRank` only in the comparisons
 * remotables, for which `compareFull` only judges two remotable to be equal if
 * if they are the same remotable, which is what we want here.
 *
 * Since `testFullOrderEQ` is a convenience only for testing, some normal
 * security constraints do not apply. `testFullOrderEQ` hardens the `specimen`
 * and `expected` arguments, so that if the only reason they were not passable
 * is that they were not yet hardened, `testFullOrderEQ` takes case of that for
 * you.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {Passable} specimen
 * @param {Passable} expected
 * @param {string} [message]
 */
export const testFullOrderEQ = (t, specimen, expected, message) => {
  const { comparator: compareFull } = makeFullOrderComparatorKit();
  return t.is(compareFull(harden(specimen), harden(expected)), 0, message);
};
harden(testFullOrderEQ);
