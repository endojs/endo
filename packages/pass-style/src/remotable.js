/// <reference types="ses"/>

import { Fail, q } from '@endo/errors';
import { extraObjectMethods } from '@endo/non-trapping-shim';
import {
  assertChecker,
  canBeMethod,
  hasOwnPropertyOf,
  PASS_STYLE,
  checkTagRecord,
  checkFunctionTagRecord,
  isObject,
  getTag,
  CX,
} from './passStyle-helpers.js';

/**
 * @import {Checker} from './types.js'
 * @import {InterfaceSpec, PassStyled} from './types.js'
 * @import {PassStyleHelper} from './internal-types.js'
 * @import {RemotableObject as Remotable} from './types.js'
 */

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getPrototypeOf,
  prototype: objectPrototype,
  getOwnPropertyDescriptors,
} = Object;
const { isNonTrapping } = extraObjectMethods;

/**
 * @param {InterfaceSpec} iface
 * @param {Checker} [check]
 */
const checkIface = (iface, check) => {
  return (
    // TODO other possible ifaces, once we have third party veracity
    (typeof iface === 'string' ||
      (!!check &&
        CX(
          check,
        )`For now, interface ${iface} must be a string; unimplemented`)) &&
    (iface === 'Remotable' ||
      iface.startsWith('Alleged: ') ||
      iface.startsWith('DebugName: ') ||
      (!!check &&
        CX(check)`For now, iface ${q(
          iface,
        )} must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented`))
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
 * @param {object | Function} original
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotableProtoOf = (original, check) => {
  isObject(original) ||
    Fail`Remotables must be objects or functions: ${original}`;

  // A valid remotable object must inherit from a "tag record" -- a
  // plain-object prototype consisting of only
  // a `PASS_STYLE` property with value "remotable" and a suitable `Symbol.toStringTag`
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
  if (
    proto === objectPrototype ||
    proto === null ||
    proto === Function.prototype
  ) {
    return (
      !!check &&
      CX(check)`Remotables must be explicitly declared: ${q(original)}`
    );
  }

  if (typeof original === 'object') {
    const protoProto = getPrototypeOf(proto);
    if (protoProto !== objectPrototype && protoProto !== null) {
      // eslint-disable-next-line no-use-before-define
      return checkRemotable(proto, check);
    }
    if (!checkTagRecord(proto, 'remotable', check)) {
      return false;
    }
  } else if (typeof original === 'function') {
    if (!checkFunctionTagRecord(proto, 'remotable', check)) {
      return false;
    }
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
      (!!check &&
        CX(
          check,
        )`Unexpected properties on Remotable Proto ${ownKeys(restDescs)}`)) &&
    checkIface(iface, check)
  );
};

/**
 * Keep a weak set of confirmed remotables for marshal performance
 * (without which we would incur a redundant verification in
 * getInterfaceOf).
 * We don't remember rejections because they are possible to correct
 * with e.g. `harden`.
 *
 * @type {WeakSet<Remotable>}
 */
const confirmedRemotables = new WeakSet();

/**
 * @param {any} val
 * @param {Checker} [check]
 * @returns {val is Remotable}
 */
const checkRemotable = (val, check) => {
  if (confirmedRemotables.has(val)) {
    return true;
  }
  if (!isNonTrapping(val)) {
    return (
      !!check && CX(check)`cannot serialize non-frozen objects like ${val}`
    );
  }
  // eslint-disable-next-line no-use-before-define
  if (!RemotableHelper.canBeValid(val, check)) {
    return false;
  }
  const result = checkRemotableProtoOf(val, check);
  if (result) {
    confirmedRemotables.add(val);
  }
  return result;
};

/**
 * Simple semantics, just tell what interface spec a Remotable has,
 * or undefined if not deemed to be a Remotable.
 *
 * @type {{
 * <T extends string>(val: PassStyled<any, T>): T;
 * (val: any): InterfaceSpec | undefined;
 * }}
 */
export const getInterfaceOf = val => {
  if (
    !isObject(val) ||
    val[PASS_STYLE] !== 'remotable' ||
    !checkRemotable(val)
  ) {
    // @ts-expect-error narrowed
    return undefined;
  }
  // @ts-expect-error narrowed
  return getTag(val);
};
harden(getInterfaceOf);

/**
 *
 * @type {PassStyleHelper}
 */
export const RemotableHelper = harden({
  styleName: 'remotable',

  canBeValid: (candidate, check = undefined) => {
    const validType =
      (isObject(candidate) ||
        (!!check &&
          CX(check)`cannot serialize non-objects as Remotable ${candidate}`)) &&
      (!isArray(candidate) ||
        (!!check &&
          CX(check)`cannot serialize arrays as Remotable ${candidate}`));
    if (!validType) {
      return false;
    }

    const descs = getOwnPropertyDescriptors(candidate);
    if (typeof candidate === 'object') {
      // Every own property (regardless of enumerability)
      // must have a function value.
      return ownKeys(descs).every(key => {
        return (
          // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
          (hasOwnPropertyOf(descs[/** @type {string} */ (key)], 'value') ||
            (!!check &&
              CX(check)`cannot serialize Remotables with accessors like ${q(
                String(key),
              )} in ${candidate}`)) &&
          ((key === Symbol.toStringTag && checkIface(candidate[key], check)) ||
            ((canBeMethod(candidate[key]) ||
              (!!check &&
                CX(check)`cannot serialize Remotables with non-methods like ${q(
                  String(key),
                )} in ${candidate}`)) &&
              (key !== PASS_STYLE ||
                (!!check &&
                  CX(check)`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`))))
        );
      });
    } else if (typeof candidate === 'function') {
      // Far functions cannot be methods, and cannot have methods.
      // They must have exactly expected `.name` and `.length` properties
      const {
        name: nameDesc,
        length: lengthDesc,
        // @ts-ignore TS doesn't like symbols as computed indexes??
        [Symbol.toStringTag]: toStringTagDesc,
        ...restDescs
      } = descs;
      const restKeys = ownKeys(restDescs);
      return (
        ((nameDesc && typeof nameDesc.value === 'string') ||
          (!!check &&
            CX(check)`Far function name must be a string, in ${candidate}`)) &&
        ((lengthDesc && typeof lengthDesc.value === 'number') ||
          (!!check &&
            CX(
              check,
            )`Far function length must be a number, in ${candidate}`)) &&
        (toStringTagDesc === undefined ||
          ((typeof toStringTagDesc.value === 'string' ||
            (!!check &&
              CX(
                check,
              )`Far function @@toStringTag must be a string, in ${candidate}`)) &&
            checkIface(toStringTagDesc.value, check))) &&
        (restKeys.length === 0 ||
          (!!check &&
            CX(
              check,
            )`Far functions unexpected properties besides .name and .length ${restKeys}`))
      );
    }
    return !!check && CX(check)`unrecognized typeof ${candidate}`;
  },

  assertValid: candidate => checkRemotable(candidate, assertChecker),

  every: (_passable, _fn) => true,
});
