/// <reference types="ses"/>

import { Fail, q, hideAndHardenFunction } from '@endo/errors';
import { getMethodNames } from '@endo/eventual-send/utils.js';
import {
  PASS_STYLE,
  confirmTagRecord,
  confirmFunctionTagRecord,
  isPrimitive,
  getTag,
} from './passStyle-helpers.js';

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 * @import {InterfaceSpec, PassStyled, RemotableObject, RemotableMethodName} from './types.js';
 */

/**
 * For a function to be a valid method, it must not be passable.
 * Otherwise, we risk confusing pass-by-copy data carrying
 * far functions with attempts at far objects with methods.
 *
 * TODO HAZARD Because we check this on the way to hardening a remotable,
 * we cannot yet check that `func` is hardened. However, without
 * doing so, it's inheritance might change after the `PASS_STYLE`
 * check below.
 *
 * @param {any} func
 * @returns {func is CallableFunction}
 */
export const canBeMethod = func =>
  typeof func === 'function' && !(PASS_STYLE in func);
harden(canBeMethod);

// TODO https://github.com/endojs/endo/issues/2884
// Abstract out canBeMethodName so later PRs agree on method name restrictions.

/**
 * @param {any} key
 * @returns {key is RemotableMethodName}
 */
const canBeMethodName = key =>
  // typeof key === 'string' || typeof key === 'symbol';
  typeof key === 'string' || typeof key === 'symbol' || typeof key === 'number';
harden(canBeMethodName);

/**
 * Uses the `getMethodNames` from the eventual-send level of abstraction that
 * does not know anything about remotables.
 *
 * Currently, just alias `getMethodNames` but this abstraction exists so
 * a future PR can enforce restrictions on method names of remotables.
 *
 * @template {Record<string, CallableFunction>} T
 * @param {T} behaviorMethods
 * @returns {RemotableMethodName[]}
 */
export const getRemotableMethodNames = behaviorMethods =>
  getMethodNames(behaviorMethods);
harden(getRemotableMethodNames);

const { ownKeys } = Reflect;
const { isArray } = Array;
const {
  getPrototypeOf,
  isFrozen,
  prototype: objectPrototype,
  getOwnPropertyDescriptors,
  hasOwn,
} = Object;

/**
 * @param {InterfaceSpec} iface
 * @param {Rejector} reject
 */
const confirmIface = (iface, reject) => {
  return (
    // TODO other possible ifaces, once we have third party veracity
    (typeof iface === 'string' ||
      (reject &&
        reject`For now, interface ${iface} must be a string; unimplemented`)) &&
    (iface === 'Remotable' ||
      iface.startsWith('Alleged: ') ||
      iface.startsWith('DebugName: ') ||
      (reject &&
        reject`For now, iface ${q(
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
export const assertIface = iface => confirmIface(iface, Fail);
hideAndHardenFunction(assertIface);

/**
 * @param {object | Function} original
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmRemotableProtoOf = (original, reject) => {
  !isPrimitive(original) ||
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
      reject && reject`Remotables must be explicitly declared: ${q(original)}`
    );
  }

  if (typeof original === 'object') {
    const protoProto = getPrototypeOf(proto);
    if (protoProto !== objectPrototype && protoProto !== null) {
      // eslint-disable-next-line no-use-before-define
      return confirmRemotable(proto, reject);
    }
    if (!confirmTagRecord(proto, 'remotable', reject)) {
      return false;
    }
  } else if (typeof original === 'function') {
    if (!confirmFunctionTagRecord(proto, 'remotable', reject)) {
      return false;
    }
  }

  // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
  const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
  const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
  const {
    // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
    [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
    [/** @type {string} */ (tagKey)]: { value: iface },
    ...restDescs
  } = getOwnPropertyDescriptors(proto);

  return (
    (ownKeys(restDescs).length === 0 ||
      (reject &&
        reject`Unexpected properties on Remotable Proto ${ownKeys(restDescs)}`)) &&
    confirmIface(iface, reject)
  );
};

/**
 * Keep a weak set of confirmed remotables for marshal performance
 * (without which we would incur a redundant verification in
 * getInterfaceOf).
 * We don't remember rejections because they are possible to correct
 * with e.g. `harden`.
 *
 * @type {WeakSet<RemotableObject>}
 */
const confirmedRemotables = new WeakSet();

/**
 * @param {any} val
 * @param {Rejector} reject
 * @returns {val is RemotableObject}
 */
const confirmRemotable = (val, reject) => {
  if (confirmedRemotables.has(val)) {
    return true;
  }
  if (!isFrozen(val)) {
    return reject && reject`cannot serialize non-frozen objects like ${val}`;
  }
  // eslint-disable-next-line no-use-before-define
  if (!RemotableHelper.confirmCanBeValid(val, reject)) {
    return false;
  }
  const result = confirmRemotableProtoOf(val, reject);
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
    isPrimitive(val) ||
    val[PASS_STYLE] !== 'remotable' ||
    !confirmRemotable(val, false)
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

  confirmCanBeValid: (candidate, reject) => {
    const validType =
      (!isPrimitive(candidate) ||
        (reject &&
          reject`cannot serialize non-objects as Remotable ${candidate}`)) &&
      (!isArray(candidate) ||
        (reject && reject`cannot serialize arrays as Remotable ${candidate}`));
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
          (hasOwn(descs[/** @type {string} */ (key)], 'value') ||
            (reject &&
              reject`cannot serialize Remotables with accessors like ${q(
                String(key),
              )} in ${candidate}`)) &&
          ((key === Symbol.toStringTag &&
            confirmIface(candidate[key], reject)) ||
            ((canBeMethod(candidate[key]) ||
              (reject &&
                reject`cannot serialize Remotables with non-methods like ${q(
                  String(key),
                )} in ${candidate}`)) &&
              (key !== PASS_STYLE ||
                (reject &&
                  reject`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`))))
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
          (reject &&
            reject`Far function name must be a string, in ${candidate}`)) &&
        ((lengthDesc && typeof lengthDesc.value === 'number') ||
          (reject &&
            reject`Far function length must be a number, in ${candidate}`)) &&
        (toStringTagDesc === undefined ||
          ((typeof toStringTagDesc.value === 'string' ||
            (reject &&
              reject`Far function @@toStringTag must be a string, in ${candidate}`)) &&
            confirmIface(toStringTagDesc.value, reject))) &&
        (restKeys.length === 0 ||
          (reject &&
            reject`Far functions unexpected properties besides .name and .length ${restKeys}`))
      );
    }
    return reject && reject`unrecognized typeof ${candidate}`;
  },

  assertRestValid: candidate => confirmRemotable(candidate, Fail),

  every: (_passable, _fn) => true,
});
