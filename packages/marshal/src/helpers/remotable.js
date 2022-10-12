// @ts-check

/// <reference types="ses"/>

import {
  assertChecker,
  canBeMethod,
  hasOwnPropertyOf,
  PASS_STYLE,
  checkTagRecord,
  isObject,
  getTag,
} from './passStyle-helpers.js';

/** @typedef {import('../types.js').Checker} Checker */
/** @typedef {import('../types.js').InterfaceSpec} InterfaceSpec */
/** @typedef {import('../types.js').MarshalGetInterfaceOf} MarshalGetInterfaceOf */
/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('../types.js').Remotable} Remotable */

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

/**
 * @param {InterfaceSpec} iface
 * @param {Checker} [check]
 */
const checkIface = (iface, check) => {
  const reject = !!check && (details => check(false, details));
  return (
    // TODO other possible ifaces, once we have third party veracity
    (typeof iface === 'string' ||
      (reject &&
        reject(
          X`For now, interface ${iface} must be a string; unimplemented`,
        ))) &&
    (iface === 'Remotable' ||
      iface.startsWith('Alleged: ') ||
      (reject &&
        reject(
          X`For now, iface ${q(
            iface,
          )} must be "Remotable" or begin with "Alleged: "; unimplemented`,
        )))
  );
};

/**
 * An `iface` must be pure. Right now it must be a string, which is pure.
 * Later we expect to include some other values that qualify as `PureData`,
 * which is a pass-by-copy superstructure ending only in primitives or
 * empty pass-by-copy composites. No remotables, promises, or errors.
 * We *assume* for now that the pass-by-copy superstructure contains no
 * proxies.
 *
 * @param {InterfaceSpec} iface
 */
export const assertIface = iface => checkIface(iface, assertChecker);
harden(assertIface);

/**
 * @param {any} original
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotableProtoOf = (original, check) => {
  const reject = !!check && (details => check(false, details));
  // A valid remotable object must inherit from a "tag record" -- a
  // plain-object prototype consisting of only
  // a suitable `PASS_STYLE` property and a suitable `Symbol.toStringTag`
  // property. The remotable could inherit directly from such a tag record, or
  // it could inherit from another valid remotable, that therefore itself
  // inherits directly or indirectly from such a tag record.
  //
  // TODO: It would be nice to typedef this shape, but we can't declare a type
  // with PASS_STYLE from JSDoc.
  //
  // @type {{ [PASS_STYLE]: string,
  //          [Symbol.toStringTag]: string,
  //        }}
  //
  const proto = getPrototypeOf(original);
  const protoProto = proto === null ? null : getPrototypeOf(proto);
  if (
    typeof original === 'object' &&
    proto !== objectPrototype &&
    protoProto !== objectPrototype &&
    protoProto !== null
  ) {
    return (
      // eslint-disable-next-line no-use-before-define
      RemotableHelper.canBeValid(proto, check) && checkRemotable(proto, check)
    );
  }

  // Since we're working with TypeScript's unsound type system, mostly
  // to catch accidents and to provide IDE support, we type arguments
  // like `val` according to what they are supposed to be. The following
  // tests for a particular violation. However, TypeScript complains
  // because *if the declared type were accurate*, then the condition
  // would always return true.
  // @ts-ignore TypeScript assumes what we're trying to check
  if (proto === objectPrototype) {
    return (
      reject &&
      reject(X`Remotables must be explicitly declared: ${q(original)}`)
    );
  }
  if (!checkTagRecord(proto, 'remotable', check)) {
    return false;
  }

  if (typeof original === 'object') {
    const valid = protoProto === objectPrototype || protoProto === null;
    if (!valid) {
      return (
        reject &&
        reject(
          X`The Remotable Proto marker cannot inherit from anything unusual`,
        )
      );
    }
  } else if (typeof original === 'function') {
    const valid =
      protoProto === functionPrototype ||
      getPrototypeOf(protoProto) === functionPrototype;
    if (!valid) {
      return (
        reject &&
        reject(
          X`For far functions, the Remotable Proto marker must inherit from Function.prototype, in ${original}`,
        )
      );
    }
  } else {
    // XXX Should this be reject instead?
    assert.fail(X`unrecognized typeof ${original}`);
  }

  // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
  const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
  const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
  const {
    // checkTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
    [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
    [/** @type {string} */ (tagKey)]: { value: iface },
    ...restDescs
  } = getOwnPropertyDescriptors(proto);

  return (
    (ownKeys(restDescs).length === 0 ||
      (reject &&
        reject(
          X`Unexpected properties on Remotable Proto ${ownKeys(restDescs)}`,
        ))) &&
    checkIface(iface, check)
  );
};

/**
 * @param {Remotable} val
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotable = (val, check) => {
  const reject = !!check && (details => check(false, details));
  if (!isFrozen(val)) {
    return reject && reject(X`cannot serialize non-frozen objects like ${val}`);
  }
  // eslint-disable-next-line no-use-before-define
  if (!RemotableHelper.canBeValid(val, check)) {
    return false;
  }
  return checkRemotableProtoOf(val, check);
};

const isRemotable = val => checkRemotable(val, x => x);

/** @type {MarshalGetInterfaceOf} */
export const getInterfaceOf = val => {
  const typestr = typeof val;
  if (
    (typestr !== 'object' && typestr !== 'function') ||
    val === null ||
    val[PASS_STYLE] !== 'remotable' ||
    !isRemotable(val)
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

  canBeValid: (candidate, check) => {
    const reject = !!check && (details => check(false, details));
    if (!isObject(candidate)) {
      return (
        (reject && reject(X`cannot serialize non-objects like ${candidate}`))
      );
    } else if (isArray(candidate)) {
      // TODO: X`cannot serialize arrays as remotable: ${candidate}`?
      return reject && reject(X`Arrays cannot be pass-by-remote`);
    }

    const descs = getOwnPropertyDescriptors(candidate);
    if (typeof candidate === 'object') {
      const keys = ownKeys(descs); // enumerable-and-not, string-or-Symbol
      return keys.every(key => {
        return (
          // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
          ((hasOwnPropertyOf(descs[/** @type {string} */ (key)], 'value') ||
            (reject &&
              reject(
                X`cannot serialize Remotables with accessors like ${q(
                  String(key),
                )} in ${candidate}`,
              ))) &&
          (canBeMethod(candidate[key]) ||
            (reject &&
              reject(
                X`cannot serialize Remotables with non-methods like ${q(
                  String(key),
                )} in ${candidate}`,
              ))) &&
          (key !== PASS_STYLE ||
            (reject &&
              reject(X`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`))))
        );
      });
    } else if (typeof candidate === 'function') {
      // Far functions cannot be methods, and cannot have methods.
      // They must have exactly expected `.name` and `.length` properties
      const { name: nameDesc, length: lengthDesc, ...restDescs } = descs;
      const restKeys = ownKeys(restDescs);
      return (
        (((nameDesc && typeof nameDesc.value === 'string') ||
          (reject &&
            reject(X`Far function name must be a string, in ${candidate}`))) &&
        ((lengthDesc && typeof lengthDesc.value === 'number') ||
          (reject &&
            reject(
              X`Far function length must be a number, in ${candidate}`,
            ))) &&
        (restKeys.length === 0 ||
          (reject &&
            reject(
              X`Far functions unexpected properties besides .name and .length ${restKeys}`,
            ))))
      );
    } else {
      return reject && reject(X`unrecognized typeof ${candidate}`);
    }
  },

  assertValid: candidate => {
    RemotableHelper.canBeValid(candidate, assertChecker);
    checkRemotable(candidate, assertChecker);
  },

  every: (_passable, _fn) => true,
});
