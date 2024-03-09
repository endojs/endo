/* eslint-disable no-use-before-define */
/// <reference types="ses"/>

import { E } from '@endo/eventual-send';
import { getMethodNames } from '@endo/eventual-send/utils.js';
import {
  isObject,
  getInterfaceOf,
  passStyleOf,
  Remotable,
} from '@endo/pass-style';
import { Fail } from '@endo/errors';
import { makeMarshal } from './marshal.js';

const { fromEntries, defineProperties } = Object;

/**
 * @param {import('@endo/pass-style').Passable} blueTarget
 */
export const makeDotMembraneKit = blueTarget => {
  // TODO(erights): Add Converter type
  /**
   * @param {any} [mirrorConverter]
   */
  const makeConverter = (mirrorConverter = undefined) => {
    const myColor = mirrorConverter ? 'blue' : 'yellow';
    /** @type {WeakMap<any,any>=} */
    let memoMineToYours = new WeakMap();
    let optReasonString;
    const myRevoke = reasonString => {
      assert.typeof(reasonString, 'string');
      memoMineToYours = undefined;
      optReasonString = reasonString;
      if (optBlueRevoke) {
        // In this case, myRevoke is the yellowRevoke
        optBlueRevoke(reasonString);
      }
    };
    const convertMineToYours = (mine, _optIface = undefined) => {
      if (memoMineToYours === undefined) {
        throw harden(ReferenceError(`Revoked: ${optReasonString}`));
      }
      if (memoMineToYours.has(mine)) {
        return memoMineToYours.get(mine);
      }
      let yours;
      const passStyle = passStyleOf(mine);
      switch (passStyle) {
        case 'promise': {
          let yourResolve;
          let yourReject;
          yours = harden(
            new Promise((res, rej) => {
              yourResolve = res;
              yourReject = rej;
            }),
          );
          const myResolve = myFulfillment =>
            yourResolve(mineToYours(myFulfillment));
          const myReject = myReason => yourReject(mineToYours(myReason));
          E.when(
            mine,
            myFulfillment => myResolve(myFulfillment),
            myReason => myReject(myReason),
          )
            .catch(metaReason =>
              // This can happen if myFulfillment or myReason is not passable.
              // TODO verify that metaReason must be my-side-safe, or rather,
              // that the passing of it is your-side-safe.
              myReject(metaReason),
            )
            .catch(metaMetaReason =>
              // In case metaReason itself doesn't mineToYours
              myReject(metaMetaReason),
            );
          break;
        }
        case 'remotable': {
          /** @param {PropertyKey} [optVerb] */
          const myMethodToYours = (optVerb = undefined) => {
            const yourMethod = (...yourArgs) => {
              // We use mineIf rather than mine so that mine is not accessible
              // after revocation. This gives the correct error behavior,
              // but may not actually enable mine to be gc'ed, depending on
              // the JS engine.
              // TODO Could rewrite to keep scopes more separate, so post-revoke
              // gc works more often.
              const mineIf = yoursToMine(yours);

              assert(!isObject(optVerb));
              const myArgs = yoursToMine(harden(yourArgs));
              let myResult;

              try {
                myResult = optVerb
                  ? mineIf[optVerb](...myArgs)
                  : mineIf(...myArgs);
              } catch (myReason) {
                const yourReason = mineToYours(harden(myReason));
                throw yourReason;
              }
              const yourResult = mineToYours(harden(myResult));
              return yourResult;
            };
            if (optVerb) {
              defineProperties(yourMethod, {
                name: { value: String(optVerb) },
                length: { value: Number(mine[optVerb].length || 0) },
              });
            } else {
              defineProperties(yourMethod, {
                name: { value: String(mine.name || 'anon') },
                length: { value: Number(mine.length || 0) },
              });
            }
            return yourMethod;
          };
          const iface = String(getInterfaceOf(mine) || 'unlabeled remotable');
          if (typeof mine === 'function') {
            // NOTE: Assumes that a far function has no "static" methods. This
            // is the current marshal design, but revisit this if we change our
            // minds.
            yours = Remotable(iface, undefined, myMethodToYours());
          } else {
            const myMethodNames = getMethodNames(mine);
            const yourMethods = myMethodNames.map(name => [
              name,
              myMethodToYours(name),
            ]);
            yours = Remotable(iface, undefined, fromEntries(yourMethods));
          }
          break;
        }
        default: {
          Fail`internal: Unrecognized passStyle ${passStyle}`;
        }
      }
      memoMineToYours.set(mine, yours);
      memoYoursToMine.set(yours, mine);
      return yours;
    };

    const { toCapData: myToYellowCapData, fromCapData: yourFromYellowCapData } =
      makeMarshal(
        // convert from my value to a yellow slot. undefined is identity.
        myColor === 'yellow' ? undefined : convertMineToYours,
        // convert from a yellow slot to your value. undefined is identity.
        myColor === 'blue' ? undefined : convertMineToYours,
        {
          serializeBodyFormat: 'smallcaps',
        },
      );

    const mineToYours = mine => {
      const yellowCapData = myToYellowCapData(mine);
      const yours = yourFromYellowCapData(yellowCapData);
      return yours;
    };
    const converter = harden({
      memoMineToYours,
      mineToYours,
      yourToMine: target => yoursToMine(target),
      myRevoke,
    });
    let optBlueRevoke;
    if (mirrorConverter === undefined) {
      assert(myColor === 'yellow');
      // in this case, converter is the yellowConverter
      // and mirrorConverter will be the blueConverter
      mirrorConverter = makeConverter(converter);
      optBlueRevoke = mirrorConverter.myRevoke;
    }
    const { memoMineToYours: memoYoursToMine, mineToYours: yoursToMine } =
      mirrorConverter;
    return converter;
  };

  const yellowConverter = makeConverter();
  return harden({
    yellowProxy: yellowConverter.yourToMine(blueTarget),
    yellowRevoke: yellowConverter.myRevoke,
  });
};
harden(makeDotMembraneKit);
