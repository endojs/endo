import { X, q } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';
import { getTag, isObject } from './passStyle-helpers.js';
import { passStyleOf } from './passStyleOf.js';
import { makeTagged } from './makeTagged.js';

/**
 * @import {Passable, CopyRecord, CopyArray, CopyTagged, RemotableObject} from '@endo/pass-style'
 */
/** @import {Callable, RemotableBrand} from '@endo/eventual-send' */

const { ownKeys } = Reflect;
const { fromEntries } = Object;

/**
 * Currently copied from @agoric/internal utils.js.
 * TODO Should migrate here and then, if needed, reexported there.
 *
 * @template T
 * @typedef {{ [KeyType in keyof T]: T[KeyType] } & {}} Simplify flatten the
 *   type output to improve type hints shown in editors
 *   https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
 */

/**
 * @template T
 * @typedef {boolean extends (T extends never ? true : false)
 *   ? T    // pass through the `any` type
 *   : T extends PromiseLike<any>
 *     ? DeeplyAwaited<Awaited<T>>
 *     : T extends object
 *       ? T extends (Callable | RemotableBrand<any, any> | RemotableObject)
 *         ? T
 *         : Simplify<{[K in keyof T]: DeeplyAwaited<T[K]>}>
 *       : T} DeeplyAwaited
 */

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
 * If `val` or its parts are non-key Passables only *because* they contain
 * promises, the deeply fulfilled forms of val or its parts may be keys. This
 * is for the higher "@endo/patterns" level of abstraction to determine,
 * because it defines the `Key` notion in question.
 *
 * @template {Passable} T
 * @param {T} val
 * @returns {Promise<DeeplyAwaited<T>>}
 */
export const deeplyFulfilled = async val => {
  // TODO Figure out why we need these at-expect-error directives below
  // and fix if possible.
  // https://github.com/endojs/endo/issues/1257 may be relevant.

  if (!isObject(val)) {
    return /** @type {DeeplyAwaited<T>} */ (val);
  }
  if (isPromise(val)) {
    return E.when(val, nonp => deeplyFulfilled(nonp));
  }
  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'copyRecord': {
      const rec = /** @type {CopyRecord} */ (val);
      const names = /** @type {string[]} */ (ownKeys(rec));
      const valPs = names.map(name => deeplyFulfilled(rec[name]));
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(Promise.all(valPs), vals =>
        harden(fromEntries(vals.map((c, i) => [names[i], c]))),
      );
    }
    case 'copyArray': {
      const arr = /** @type {CopyArray} */ (val);
      const valPs = arr.map(p => deeplyFulfilled(p));
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(Promise.all(valPs), vals => harden(vals));
    }
    case 'tagged': {
      const tgd = /** @type {CopyTagged} */ (val);
      const tag = getTag(tgd);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return E.when(deeplyFulfilled(tgd.payload), payload =>
        makeTagged(tag, payload),
      );
    }
    case 'remotable': {
      const rem = /** @type {RemotableObject} */ (val);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return rem;
    }
    case 'error': {
      const err = /** @type {Error} */ (val);
      // @ts-expect-error not assignable to type 'DeeplyAwaited<T>'
      return err;
    }
    case 'promise': {
      const prom = /** @type {Promise} */ (/** @type {unknown} */ (val));
      return E.when(prom, nonp => deeplyFulfilled(nonp));
    }
    default: {
      throw assert.fail(X`Unexpected passStyle ${q(passStyle)}`, TypeError);
    }
  }
};
harden(deeplyFulfilled);
