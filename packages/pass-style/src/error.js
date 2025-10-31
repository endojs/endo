/// <reference types="ses"/>

import { Fail, q, hideAndHardenFunction } from '@endo/errors';

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 * @import {PassStyle} from './types.js';
 */

const {
  defineProperty,
  getPrototypeOf,
  getOwnPropertyDescriptors,
  getOwnPropertyDescriptor,
  hasOwn,
  entries,
  freeze,
} = Object;

const { apply } = Reflect;

const hardenIsFake = () => {
  // We do not trust isFrozen because lockdown with unsafe hardenTaming replaces
  // isFrozen with a version that is in cahoots with fake harden.
  const subject = harden({ __proto__: null, x: 0 });
  const desc = getOwnPropertyDescriptor(subject, 'x');
  return desc?.writable === true;
};

const makeRepairError = () => {
  if (!hardenIsFake()) {
    return undefined;
  }

  const er1StackDesc = getOwnPropertyDescriptor(Error('er1'), 'stack');
  const er2StackDesc = getOwnPropertyDescriptor(TypeError('er2'), 'stack');

  if (
    er1StackDesc === undefined ||
    er2StackDesc === undefined ||
    er1StackDesc.get === undefined
  ) {
    return undefined;
  }

  // We should only encounter this case on v8 because of its problematic
  // error own stack accessor behavior.
  // Note that FF/SpiderMonkey, Moddable/XS, and the error stack proposal
  // all inherit a stack accessor property from Error.prototype, which is
  // great. That case needs no heroics to secure.
  if (
    // In the v8 case as we understand it, all errors have an own stack
    // accessor property, but within the same realm, all these accessor
    // properties have the same getter and have the same setter.
    // This is therefore the case that we repair.
    typeof er1StackDesc.get !== 'function' ||
    er1StackDesc.get !== er2StackDesc.get ||
    typeof er1StackDesc.set !== 'function' ||
    er1StackDesc.set !== er2StackDesc.set
  ) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR.md
    throw TypeError(
      'Unexpected Error own stack accessor functions (PASS_STYLE_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)',
    );
  }

  // Otherwise, we have own stack accessor properties that are outside
  // our expectations, that therefore need to be understood better
  // before we know how to repair them.
  const feralStackGetter = freeze(er1StackDesc.get);

  const repairError = error => {
    // Only pay the overhead if it first passes this cheap isError
    // check. Otherwise, it will be unrepaired, but won't be judged
    // to be a passable error anyway, so will not be unsafe.
    const stackDesc = getOwnPropertyDescriptor(error, 'stack');
    if (
      stackDesc &&
      stackDesc.get === feralStackGetter &&
      stackDesc.configurable
    ) {
      // Can only repair if it is configurable. Otherwise, leave
      // unrepaired, in which case it will not be judged passable,
      // avoiding a safety problem.
      defineProperty(error, 'stack', {
        // NOTE: Calls getter during harden, which seems dangerous.
        // But we're only calling the problematic getter whose
        // hazards we think we understand.
        value: apply(feralStackGetter, error, []),
      });
    }
  };
  harden(repairError);

  return repairError;
};
harden(makeRepairError);

const repairError = makeRepairError();

// TODO: Maintenance hazard: Coordinate with the list of errors in the SES
// whilelist.
const errorConstructors = new Map(
  // Cast because otherwise TS is confused by AggregateError
  // See https://github.com/endojs/endo/pull/2042#discussion_r1484933028
  /** @type {Array<[string, import('ses').GenericErrorConstructor]>} */
  ([
    ['Error', Error],
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError],

    // https://github.com/endojs/endo/issues/550
    // To accommodate platforms prior to AggregateError, we comment out the
    // following line and instead conditionally add it to the map below.
    // ['AggregateError', AggregateError],
  ]),
);

if (typeof AggregateError !== 'undefined') {
  // Conditional, to accommodate platforms prior to AggregateError
  errorConstructors.set('AggregateError', AggregateError);
}

/**
 * Because the error constructor returned by this function might be
 * `AggregateError`, which has different construction parameters
 * from the other error constructors, do not use it directly to try
 * to make an error instance. Rather, use `makeError` which encapsulates
 * this non-uniformity.
 *
 * @param {string} name
 * @returns {import('ses').GenericErrorConstructor | undefined}
 */
export const getErrorConstructor = name => errorConstructors.get(name);
harden(getErrorConstructor);

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmErrorLike = (candidate, reject) => {
  // TODO: Need a better test than instanceof
  return (
    candidate instanceof Error ||
    (reject && reject`Error expected: ${candidate}`)
  );
};
harden(confirmErrorLike);
/// <reference types="ses"/>

/**
 * Validating error objects are passable raises a tension between security
 * vs preserving diagnostic information. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error-like test succeed and to couch these
 * complaints as notes on the error.
 *
 * To resolve this, such a malformed error object will still pass
 * `isErrorLike` so marshal can use this for top level error to report from,
 * even if it would not actually validate.
 * Instead, the diagnostics that `assertError` would have reported are
 * attached as notes to the malformed error. Thus, a malformed
 * error is passable by itself, but not as part of a passable structure.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
export const isErrorLike = candidate => confirmErrorLike(candidate, false);
hideAndHardenFunction(isErrorLike);

/**
 * @param {string} propName
 * @param {PropertyDescriptor} desc
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmRecursivelyPassableErrorPropertyDesc = (
  propName,
  desc,
  passStyleOfRecur,
  reject,
) => {
  if (desc.enumerable) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must not be enumerable: ${desc}`
    );
  }
  if (!hasOwn(desc, 'value')) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must be a data property: ${desc}`
    );
  }
  const { value } = desc;
  switch (propName) {
    case 'message':
    case 'stack': {
      return (
        typeof value === 'string' ||
        (reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a string: ${value}`)
      );
    }
    case 'cause': {
      // eslint-disable-next-line no-use-before-define
      return confirmRecursivelyPassableError(value, passStyleOfRecur, reject);
    }
    case 'errors': {
      if (!Array.isArray(value) || passStyleOfRecur(value) !== 'copyArray') {
        return (
          reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a copyArray: ${value}`
        );
      }
      return value.every(err =>
        // eslint-disable-next-line no-use-before-define
        confirmRecursivelyPassableError(err, passStyleOfRecur, reject),
      );
    }
    default: {
      break;
    }
  }
  return (
    reject && reject`Passable Error has extra unpassed property ${q(propName)}`
  );
};
harden(confirmRecursivelyPassableErrorPropertyDesc);

/**
 * @param {unknown} candidate
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmRecursivelyPassableError = (
  candidate,
  passStyleOfRecur,
  reject,
) => {
  if (!confirmErrorLike(candidate, reject)) {
    return false;
  }
  const proto = getPrototypeOf(candidate);
  const { name } = proto;
  const errConstructor = getErrorConstructor(name);
  if (errConstructor === undefined || errConstructor.prototype !== proto) {
    return (
      reject &&
      reject`Passable Error must inherit from an error class .prototype: ${candidate}`
    );
  }
  if (repairError !== undefined) {
    repairError(candidate);
  }
  const descs = getOwnPropertyDescriptors(candidate);
  if (!('message' in descs)) {
    return (
      reject &&
      reject`Passable Error must have an own "message" string property: ${candidate}`
    );
  }

  return entries(descs).every(([propName, desc]) =>
    confirmRecursivelyPassableErrorPropertyDesc(
      propName,
      desc,
      passStyleOfRecur,
      reject,
    ),
  );
};
harden(confirmRecursivelyPassableError);

/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper = harden({
  styleName: 'error',

  confirmCanBeValid: confirmErrorLike,

  assertRestValid: (candidate, passStyleOfRecur) =>
    confirmRecursivelyPassableError(candidate, passStyleOfRecur, Fail),
});
