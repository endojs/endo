/* eslint-disable no-use-before-define */
// @ts-check

/// <reference types="ses"/>

import { E } from '@endo/eventual-send';
import { isObject } from './helpers/passStyle-helpers.js';
import { getInterfaceOf } from './helpers/remotable.js';
import { Far } from './make-far.js';
import { makeMarshal } from './marshal.js';
import { passStyleOf } from './passStyleOf.js';

const { fromEntries } = Object;
const { ownKeys } = Reflect;
const { details: X } = assert;

// TODO(erights): Add Converter type
/** @param {any} [mirrorConverter] */
const makeConverter = (mirrorConverter = undefined) => {
  /** @type {WeakMap<any,any>=} */
  let mineToYours = new WeakMap();
  let optReasonString;
  const myRevoke = reasonString => {
    assert.typeof(reasonString, 'string');
    mineToYours = undefined;
    optReasonString = reasonString;
    if (optInnerRevoke) {
      optInnerRevoke(reasonString);
    }
  };
  const convertMineToYours = (mine, _optIface = undefined) => {
    if (mineToYours === undefined) {
      throw harden(ReferenceError(`Revoked: ${optReasonString}`));
    }
    if (mineToYours.has(mine)) {
      return mineToYours.get(mine);
    }
    let yours;
    const passStyle = passStyleOf(mine);
    switch (passStyle) {
      case 'promise': {
        let yourResolve;
        let yourReject;
        yours = new Promise((res, rej) => {
          yourResolve = res;
          yourReject = rej;
        });
        E.when(
          mine,
          myFulfillment => yourResolve(pass(myFulfillment)),
          myReason => yourReject(pass(myReason)),
        )
          .catch(metaReason =>
            // This can happen if myFulfillment or myReason is not passable.
            // TODO verify that metaReason must be my-side-safe, or rather,
            // that the passing of it is your-side-safe.
            yourReject(pass(metaReason)),
          )
          .catch(metaMetaReason =>
            // In case metaReason itself doesn't pass
            yourReject(metaMetaReason),
          );
        break;
      }
      case 'remotable': {
        /** @param {PropertyKey} [optVerb] */
        const myMethodToYours = (optVerb = undefined) => (...yourArgs) => {
          // We use mineIf rather than mine so that mine is not accessible
          // after revocation. This gives the correct error behavior,
          // but may not actually enable mine to be gc'ed, depending on
          // the JS engine.
          // TODO Could rewrite to keep scopes more separate, so post-revoke
          // gc works more often.
          const mineIf = passBack(yours);

          assert(!isObject(optVerb));
          const myArgs = passBack(harden(yourArgs));
          let myResult;

          try {
            myResult =
              optVerb === undefined
                ? mineIf(...myArgs)
                : mineIf[optVerb](...myArgs);
          } catch (myReason) {
            throw pass(myReason);
          }
          return pass(myResult);
        };
        const iface = pass(getInterfaceOf(mine)) || 'unlabeled remotable';
        if (typeof mine === 'function') {
          // NOTE: Assumes that a far function has no "static" methods. This
          // is the current marshal design, but revisit this if we change our
          // minds.
          yours = Far(iface, myMethodToYours());
        } else {
          const myMethodNames = ownKeys(mine);
          const yourMethods = myMethodNames.map(name => [
            name,
            myMethodToYours(name),
          ]);
          yours = Far(iface, fromEntries(yourMethods));
        }
        break;
      }
      default: {
        assert.fail(X`internal: Unrecognized passStyle ${passStyle}`);
      }
    }
    mineToYours.set(mine, yours);
    yoursToMine.set(yours, mine);
    return yours;
  };
  // We need to pass this while convertYoursToMine is still in temporal
  // dead zone, so we wrap it in convertSlotToVal.
  const convertSlotToVal = (slot, optIface = undefined) =>
    convertYoursToMine(slot, optIface);
  const { serialize: mySerialize, unserialize: myUnserialize } = makeMarshal(
    convertMineToYours,
    convertSlotToVal,
  );
  const pass = mine => {
    const myCapData = mySerialize(mine);
    const yours = yourUnserialize(myCapData);
    return yours;
  };
  const converter = harden({
    mineToYours,
    convertMineToYours,
    myUnserialize,
    pass,
    wrap: target => passBack(target),
    myRevoke,
  });
  let optInnerRevoke;
  if (mirrorConverter === undefined) {
    mirrorConverter = makeConverter(converter);
    optInnerRevoke = mirrorConverter.myRevoke;
  }
  const {
    mineToYours: yoursToMine,
    convertMineToYours: convertYoursToMine,
    myUnserialize: yourUnserialize,
    pass: passBack,
  } = mirrorConverter;
  return converter;
};

export const makeDotMembraneKit = target => {
  const converter = makeConverter();
  return harden({
    proxy: converter.wrap(target),
    revoke: converter.myRevoke,
  });
};
harden(makeDotMembraneKit);
