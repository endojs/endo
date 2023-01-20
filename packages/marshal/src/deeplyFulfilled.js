/// <reference types="ses"/>

import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';
import { getTag, isObject, makeTagged, passStyleOf } from '@endo/pass-style';

/** @typedef {import('./types.js').Passable} Passable */
/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */

const { details: X, quote: q } = assert;
const { ownKeys } = Reflect;
const { fromEntries } = Object;

/**
 * Given a Passable `val` whose pass-by-copy structure may contain leaf
 * promises, return a promise for a replacement Passable,
 * where that replacement is *deeply fulfilled*, i.e., its
 * pass-by-copy structure does not contain any promises.
 *
 * This is a deep form of `Promise.all` specialized for Passables. For each
 * encountered promise, replace it with the deeply fulfilled form of
 * its fulfillment.
 * If any of the promises reject, then the promise for the replacement
 * rejects. If any of the promises never settle, then the promise for
 * the replacement never settles.
 *
 * If the replacement would not be Passable, i.e., if `val` is not
 * Passable, or if any of the transitive promises fulfill to something
 * that is not Passable, then the returned promise rejects.
 *
 * If `val` or its parts are non-key Passables only *because* they contains
 * promises, the deeply fulfilled forms of val or its parts may be keys. This
 * is for the higher "store" level of abstraction to determine, because it
 * defines the "key" notion in question.
 *
 * // TODO: That higher level is in the process of being migrated from
 * // `@agoric/store` to `@endo/passterns`. Once that is far enough along,
 * // revise the above comment to match.
 * // See https://github.com/endojs/endo/pull/1451
 *
 * @param {Passable} val
 * @returns {Promise<Passable>}
 */
export const deeplyFulfilled = async val => {
  if (!isObject(val)) {
    return val;
  }
  if (isPromise(val)) {
    return E.when(val, nonp => deeplyFulfilled(nonp));
  }
  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'copyRecord': {
      const names = ownKeys(val);
      const valPs = names.map(name => deeplyFulfilled(val[name]));
      return E.when(Promise.all(valPs), vals =>
        harden(fromEntries(vals.map((c, i) => [names[i], c]))),
      );
    }
    case 'copyArray': {
      const valPs = val.map(p => deeplyFulfilled(p));
      return E.when(Promise.all(valPs), vals => harden(vals));
    }
    case 'tagged': {
      const tag = getTag(val);
      return E.when(deeplyFulfilled(val.payload), payload =>
        makeTagged(tag, payload),
      );
    }
    case 'remotable': {
      return val;
    }
    case 'error': {
      return val;
    }
    case 'promise': {
      return E.when(val, nonp => deeplyFulfilled(nonp));
    }
    default: {
      assert.fail(X`Unexpected passStyle ${q(passStyle)}`, TypeError);
    }
  }
};
harden(deeplyFulfilled);
