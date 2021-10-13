// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import '../types.js';
import './internal-types.js';
import '@agoric/assert/exported.js';
import {
  assertChecker,
  canBeMethod,
  hasOwnPropertyOf,
  PASS_STYLE,
  checkTagRecord,
  isObject,
  getTag,
} from './passStyleHelpers.js';
import { getEnvironmentOption } from './environment-options.js';

const { details: X, quote: q } = assert;
const { ownKeys } = Reflect;
const { prototype: functionPrototype } = Function;
const { isArray } = Array;
const {
  getPrototypeOf,
  isFrozen,
  prototype: objectPrototype,
  getOwnPropertyDescriptors,
} = Object;

// Setting this flag to true is what allows objects with `null` or
// `Object.prototype` prototypes to be treated as remotable.  Setting to `false`
// means that only objects declared with `Remotable(...)`, including `Far(...)`
// can be used as remotables.
//
// TODO: once the policy changes to force remotables to be explicit, remove this
// flag entirely and fix code that uses it (as if it were always `false`).
export const ALLOW_IMPLICIT_REMOTABLES =
  getEnvironmentOption('ALLOW_IMPLICIT_REMOTABLES', 'false') === 'true';

/**
 * @param {InterfaceSpec} iface
 * @param {Checker=} check
 */
const checkIface = (iface, check = x => x) => {
  return (
    // TODO other possible ifaces, once we have third party veracity
    check(
      typeof iface === 'string',
      X`For now, interface ${iface} must be a string; unimplemented`,
    ) &&
    check(
      iface === 'Remotable' || iface.startsWith('Alleged: '),
      X`For now, iface ${q(
        iface,
      )} must be "Remotable" or begin with "Alleged: "; unimplemented`,
    )
  );
};

/**
 * @param {InterfaceSpec} iface
 */
export const assertIface = iface => checkIface(iface, assertChecker);
harden(assertIface);

/**
 * @param {any} original
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotableProtoOf = (original, check = x => x) => {
  /**
   * TODO: It would be nice to typedef this shape, but we can't declare a type
   * with PASS_STYLE from JSDoc.
   *
   * @type {{ [PASS_STYLE]: string,
   *          [Symbol.toStringTag]: string,
   *        }}
   */
  const proto = getPrototypeOf(original);
  if (
    !(
      check(
        // Since we're working with TypeScript's unsound type system, mostly
        // to catch accidents and to provide IDE support, we type arguments
        // like `val` according to what they are supposed to be. The following
        // tests for a particular violation. However, TypeScript complains
        // because *if the declared type were accurate*, then the condition
        // would always return true.
        // @ts-ignore TypeScript assumes what we're trying to check
        proto !== objectPrototype,
        X`Remotables must be explicitly declared: ${q(original)}`,
      ) && checkTagRecord(proto, 'remotable', check)
    )
  ) {
    return false;
  }

  const protoProto = getPrototypeOf(proto);

  if (typeof original === 'object') {
    if (
      !check(
        protoProto === objectPrototype || protoProto === null,
        X`The Remotable Proto marker cannot inherit from anything unusual`,
      )
    ) {
      return false;
    }
  } else if (typeof original === 'function') {
    if (
      !check(
        protoProto === functionPrototype ||
          getPrototypeOf(protoProto) === functionPrototype,
        X`For far functions, the Remotable Proto marker must inherit from Function.prototype, in ${original}`,
      )
    ) {
      return false;
    }
  } else {
    assert.fail(X`unrecognized typeof ${original}`);
  }

  const {
    [PASS_STYLE]: _passStyle,
    [Symbol.toStringTag]: iface,
    ...rest
  } = proto;

  return (
    check(
      ownKeys(rest).length === 0,
      X`Unexpected properties on Remotable Proto ${ownKeys(rest)}`,
    ) && checkIface(iface, check)
  );
};

/**
 * @param {Remotable} val
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotable = (val, check = x => x) => {
  const not = (cond, details) => !check(cond, details);
  if (not(isFrozen(val), X`cannot serialize non-frozen objects like ${val}`)) {
    return false;
  }
  // eslint-disable-next-line no-use-before-define
  if (!RemotableHelper.canBeValid(val, check)) {
    return false;
  }
  const p = getPrototypeOf(val);

  if (p === null || p === objectPrototype) {
    if (ALLOW_IMPLICIT_REMOTABLES) {
      const err = assert.error(
        X`Remotables should be explicitly declared: ${q(val)}`,
      );
      console.warn('Missing Far:', err);
      return true;
    }
  }
  return checkRemotableProtoOf(val, check);
};

/** @type {MarshalGetInterfaceOf} */
export const getInterfaceOf = val => {
  const typestr = typeof val;
  if (
    (typestr !== 'object' && typestr !== 'function') ||
    val === null ||
    val[PASS_STYLE] !== 'remotable' ||
    !checkRemotable(val)
  ) {
    return undefined;
  }
  return getTag(val);
};
harden(getInterfaceOf);

/**
 *
 * @type {PassStyleHelper}
 */
export const RemotableHelper = harden({
  styleName: 'remotable',

  canBeValid: (candidate, check = x => x) => {
    if (
      !(
        check(
          isObject(candidate),
          X`cannot serialize non-objects like ${candidate}`,
        ) && check(!isArray(candidate), X`Arrays cannot be pass-by-remote`)
      )
    ) {
      return false;
    }

    const descs = getOwnPropertyDescriptors(candidate);
    if (typeof candidate === 'object') {
      const keys = ownKeys(descs); // enumerable-and-not, string-or-Symbol
      return keys.every(
        key =>
          // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
          check(
            hasOwnPropertyOf(descs[/** @type {string} */ (key)], 'value'),
            X`cannot serialize Remotables with accessors like ${q(
              String(key),
            )} in ${candidate}`,
          ) &&
          check(
            canBeMethod(candidate[key]),
            X`cannot serialize Remotables with non-methods like ${q(
              String(key),
            )} in ${candidate}`,
          ) &&
          check(
            key !== PASS_STYLE,
            X`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`,
          ),
      );
    } else if (typeof candidate === 'function') {
      // Far functions cannot be methods, and cannot have methods.
      // They must have exactly expected `.name` and `.length` properties
      const { name: nameDesc, length: lengthDesc, ...restDescs } = descs;
      const restKeys = ownKeys(restDescs);
      return (
        (check(
          nameDesc && typeof nameDesc.value === 'string',
          X`Far function name must be a string, in ${candidate}`,
        ) &&
        check(
          lengthDesc && typeof lengthDesc.value === 'number',
          X`Far function length must be a number, in ${candidate}`,
        ) &&
        check(
          restKeys.length === 0,
          X`Far functions unexpected properties besides .name and .length ${restKeys}`,
        ))
      );
    } else {
      return check(false, X`unrecognized typeof ${candidate}`);
    }
  },

  assertValid: candidate => {
    RemotableHelper.canBeValid(candidate, assertChecker);
    checkRemotable(candidate, assertChecker);
  },

  every: (_passable, _fn) => true,
});
