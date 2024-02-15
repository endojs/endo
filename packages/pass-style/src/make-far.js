/// <reference types="ses"/>

import { getMethodNames } from '@endo/eventual-send/utils.js';
import { q, Fail } from '@endo/errors';
import { assertChecker, PASS_STYLE } from './passStyle-helpers.js';
import { assertIface, getInterfaceOf, RemotableHelper } from './remotable.js';

/** @typedef {import('./types.js').InterfaceSpec} InterfaceSpec */
/** @template L,R @typedef {import('@endo/eventual-send').RemotableBrand<L, R>} RemotableBrand */

const { prototype: functionPrototype } = Function;
const {
  getPrototypeOf,
  setPrototypeOf,
  create,
  isFrozen,
  prototype: objectPrototype,
} = Object;

/**
 * Now that the remotableProto does not provide its own `toString` method,
 * ensure it always inherits from something. The original prototype of
 * `remotable` if there was one, or `Object.prototype` otherwise.
 *
 * @param {object} remotable
 * @param {InterfaceSpec} iface
 * @returns {object}
 */
const makeRemotableProto = (remotable, iface) => {
  let oldProto = getPrototypeOf(remotable);
  if (typeof remotable === 'object') {
    if (oldProto === null) {
      oldProto = objectPrototype;
    }
    oldProto === objectPrototype ||
      Fail`For now, remotables cannot inherit from anything unusual, in ${remotable}`;
  } else if (typeof remotable === 'function') {
    oldProto !== null ||
      Fail`Original function must not inherit from null: ${remotable}`;
    oldProto === functionPrototype ||
      getPrototypeOf(oldProto) === functionPrototype ||
      Fail`Far functions must originally inherit from Function.prototype, in ${remotable}`;
  } else {
    Fail`unrecognized typeof ${remotable}`;
  }
  return harden(
    create(oldProto, {
      [PASS_STYLE]: { value: 'remotable' },
      [Symbol.toStringTag]: { value: iface },
    }),
  );
};

const assertCanBeRemotable = candidate =>
  RemotableHelper.canBeValid(candidate, assertChecker);

/**
 * Create and register a Remotable.  After this, getInterfaceOf(remotable)
 * returns iface.
 *
 * // https://github.com/Agoric/agoric-sdk/issues/804
 *
 * @template {{}} T
 * @param {InterfaceSpec} [iface] The interface specification for
 * the remotable. For now, a string iface must be "Remotable" or begin with
 * "Alleged: " or "DebugName: ", to serve as the alleged name. More
 * general ifaces are not yet implemented. This is temporary. We include the
 * "Alleged" or "DebugName" as a reminder that we do not yet have SwingSet
 * or Comms Vat
 * support for ensuring this is according to the vat hosting the object.
 * Currently, Alice can tell Bob about Carol, where VatA (on Alice's behalf)
 * misrepresents Carol's `iface`. VatB and therefore Bob will then see
 * Carol's `iface` as misrepresented by VatA.
 * @param {undefined} [props] Currently may only be undefined.
 * That plan is that own-properties are copied to the remotable
 * @param {T} [remotable] The object used as the remotable
 * @returns {T & RemotableBrand<{}, T>} remotable, modified for debuggability
 */
export const Remotable = (
  iface = 'Remotable',
  props = undefined,
  remotable = /** @type {T} */ ({}),
) => {
  assertIface(iface);
  assert(iface);
  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
  props === undefined || Fail`Remotable props not yet implemented ${props}`;

  // Fail fast: check that the unmodified object is able to become a Remotable.
  assertCanBeRemotable(remotable);

  // Ensure that the remotable isn't already marked.
  !(PASS_STYLE in remotable) ||
    Fail`Remotable ${remotable} is already marked as a ${q(
      remotable[PASS_STYLE],
    )}`;
  // `isFrozen` always returns true with a fake `harden`, but we want that case
  // to succeed anyway. Faking `harden` is only correctness preserving
  // if the code in question contains no bugs that the real `harden` would
  // have caught.
  // @ts-ignore `isFake` purposely not in the type
  harden.isFake ||
    // Ensure that the remotable isn't already frozen.
    !isFrozen(remotable) ||
    Fail`Remotable ${remotable} is already frozen`;
  const remotableProto = makeRemotableProto(remotable, iface);

  // Take a static copy of the enumerable own properties as data properties.
  // const propDescs = getOwnPropertyDescriptors({ ...props });
  const mutateHardenAndCheck = target => {
    // defineProperties(target, propDescs);
    setPrototypeOf(target, remotableProto);
    harden(target);
    assertCanBeRemotable(target);
  };

  // Fail fast: check a fresh remotable to see if our rules fit.
  mutateHardenAndCheck({});

  // Actually finish the new remotable.
  mutateHardenAndCheck(remotable);

  // COMMITTED!
  // We're committed, so keep the interface for future reference.
  assert(iface !== undefined); // To make TypeScript happy
  return /** @type {T & RemotableBrand<{}, T>} */ (remotable);
};
harden(Remotable);

/**
 * The name of the automatically added default meta-method for obtaining a
 * list of all methods of an object declared with `Far`, or an object that
 * inherits from an object declared with `Far`.
 *
 * Modeled on `GET_INTERFACE_GUARD` from `@endo/exo`.
 *
 * TODO Name to be bikeshed. Perhaps even whether it is a
 * string or symbol to be bikeshed. See
 * https://github.com/endojs/endo/pull/1809#discussion_r1388052454
 *
 * HAZARD: Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const GET_METHOD_NAMES = '__getMethodNames__';

/**
 * Note that `getMethodNamesMethod` is a thisful method! It must be so that
 * it works as expected with far-object inheritance.
 *
 * @returns {(string|symbol)[]}
 */
const getMethodNamesMethod = harden({
  [GET_METHOD_NAMES]() {
    return getMethodNames(this);
  },
})[GET_METHOD_NAMES];

const getMethodNamesDescriptor = harden({
  value: getMethodNamesMethod,
  enumerable: false,
  configurable: false,
  writable: false,
});

/**
 * A concise convenience for the most common `Remotable` use.
 *
 * For far objects (as opposed to far functions), also adds a miranda
 * `GET_METHOD_NAMES` method that returns an array of all the method names,
 * if there is not yet any method named `GET_METHOD_NAMES`. (Hence "miranda")
 *
 * @template {{}} T
 * @param {string} farName This name will be prepended with `Alleged: `
 * for now to form the `Remotable` `iface` argument.
 * @param {T} [remotable] The object used as the remotable
 */
export const Far = (farName, remotable = undefined) => {
  const r = remotable === undefined ? /** @type {T} */ ({}) : remotable;
  if (typeof r === 'object' && !(GET_METHOD_NAMES in r)) {
    // This test excludes far functions, since we currently consider them
    // to only have a call-behavior, with no callable methods.
    // Beware: Mutates the input argument! But `Remotable`
    // * requires the object to be mutable
    // * does further mutations,
    // * hardens the mutated object before returning it.
    // so this mutation is not unprecedented. But it is surprising!
    Object.defineProperty(r, GET_METHOD_NAMES, getMethodNamesDescriptor);
  }
  return Remotable(`Alleged: ${farName}`, undefined, r);
};
harden(Far);

/**
 * Coerce `func` to a far function that preserves its call behavior.
 * If it is already a far function, return it. Otherwise make and return a
 * new far function that wraps `func` and forwards calls to it. This
 * works even if `func` is already frozen. `ToFarFunction` is to be used
 * when the function comes from elsewhere under less control. For functions
 * you author in place, better to use `Far` on their function literal directly.
 *
 * @param {string} farName to be used only if `func` is not already a
 * far function.
 * @param {(...args: any[]) => any} func
 */
export const ToFarFunction = (farName, func) => {
  if (getInterfaceOf(func) !== undefined) {
    return func;
  }
  return Far(farName, (...args) => func(...args));
};
harden(ToFarFunction);
