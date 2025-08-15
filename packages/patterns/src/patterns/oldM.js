// This file is based on code from 1bfb9c48e01a04f05df6d78e9df1c6f5fada625c
// which is immediately prior to https://github.com/endojs/endo/pull/1712 .
// That PR changed the representation of guards. The legacy guard makers
// are useful *only* to create guards that can be used by code prior
// to https://github.com/endojs/endo/pull/1712 , like the on-chain liveSlots
// in Agoric's core-eval.

// Tested by legacy-guard-tolerance.test.js in the @endo/exo package,
// rather than here, to also test that the exo makers are tolerant of
// both legacy and current guards. We moved the tests there to avoid a
// circularity.

import { b, Fail } from '@endo/errors';
import {
  LegacyAwaitArgGuardShape,
  LegacyInterfaceGuardShape,
  LegacyMethodGuardShape,
} from './getGuardPayloads.js';
import { M, mustMatch } from './patternMatchers.js';

/**
 * @import {Pattern} from '../types.js';
 */

const { ownKeys } = Reflect;

/**
 * @param {Pattern} argPattern
 */
const makeLegacyAwaitArgGuard = argPattern => {
  const result = harden({
    klass: 'awaitArg',
    argGuard: argPattern,
  });
  mustMatch(result, LegacyAwaitArgGuardShape);
  return result;
};
harden(makeLegacyAwaitArgGuard);

/**
 * @param {'sync'|'async'} callKind
 * @param {any[]} argGuards
 * @param {any[]} [optionalArgGuards]
 * @param {any} [restArgGuard]
 */
const makeLegacyMethodGuardMaker = (
  callKind,
  argGuards,
  optionalArgGuards = undefined,
  restArgGuard = undefined,
) =>
  harden({
    optional: (...optArgGuards) => {
      optionalArgGuards === undefined ||
        Fail`Can only have one set of optional guards`;
      restArgGuard === undefined ||
        Fail`optional arg guards must come before rest arg`;
      return makeLegacyMethodGuardMaker(callKind, argGuards, optArgGuards);
    },
    rest: rArgGuard => {
      restArgGuard === undefined || Fail`Can only have one rest arg`;
      return makeLegacyMethodGuardMaker(
        callKind,
        argGuards,
        optionalArgGuards,
        rArgGuard,
      );
    },
    returns: (returnGuard = M.undefined()) => {
      const result = harden({
        klass: 'methodGuard',
        callKind,
        argGuards,
        optionalArgGuards,
        restArgGuard,
        returnGuard,
      });
      mustMatch(result, LegacyMethodGuardShape, 'methodGuard');
      return result;
    },
  });
harden(makeLegacyMethodGuardMaker);

/**
 * @param {string} interfaceName
 * @param {any} methodGuards
 * @param {{ sloppy?: boolean }} [options]
 */
const makeLegacyInterfaceGuard = (
  interfaceName,
  methodGuards,
  options = {},
) => {
  const { sloppy = false } = options;
  const stringMethodGuards = {};
  for (const key of ownKeys(methodGuards)) {
    const value = methodGuards[/** @type {string} */ (key)];
    typeof key === 'string' ||
      Fail`legacy interface guards do not support ${b(typeof key)}-named properties`;
    stringMethodGuards[key] = value;
  }
  const result = harden({
    klass: 'Interface',
    interfaceName,
    methodGuards: stringMethodGuards,
    sloppy,
  });
  mustMatch(result, LegacyInterfaceGuardShape, 'interfaceGuard');
  return result;
};
harden(makeLegacyInterfaceGuard);

/**
 * For making guard-like records that will be recognized as guards by versions
 * of Endo prior to https://github.com/endojs/endo/pull/1712 .
 * It should *only* be used for that purpose. However, even in modern Endo,
 * the `get*Payload` functions of `getGuardPayloads.js` will still work,
 * as will code that reads guards only via these `get*Payload` functions.
 * The `getInterfaceMethodKeys` and its callers should also work.
 *
 * The only example we know that needs this is Agoric's core-eval, that
 * evaluates new bundles with old liveSlots code preceding
 * https://github.com/endojs/endo/pull/1712
 *
 * @deprecated use `M` instead when possible.
 */
export const oldM = {
  ...M,
  interface: (interfaceName, methodGuards, options) =>
    makeLegacyInterfaceGuard(interfaceName, methodGuards, options),
  call: (...argPatterns) => makeLegacyMethodGuardMaker('sync', argPatterns),
  callWhen: (...argGuards) => makeLegacyMethodGuardMaker('async', argGuards),

  await: argPattern => makeLegacyAwaitArgGuard(argPattern),
};
// @ts-expect-error oldM is not M.
delete oldM.raw;
harden(oldM);
