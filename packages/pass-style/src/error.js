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

// The error repair mechanism is very similar to code in ses/src/commons.js
// and these implementations should be kept in sync.

/**
 * Pass-style must defend its own integrity under a number of configurations.
 *
 * In all environments where we use pass-style, we can in principle rely on the
 * globalThis.TypeError and globalThis.Error to be safe.
 * We have similar code in SES that stands on the irreducible risk that an
 * attacker may run before SES, so the application must either ensure that SES
 * initializes first or that all prior code is benign.
 * For all other configurations, we rely to some degree on SES lockdown and a
 * Compartment for any measure of safety.
 *
 * Pass-style may be loaded by the host module system into the primary realm,
 * which the authors call the Start Compartment.
 * SES provides no assurances that any number of guest programs can be safely
 * executed by the host in the start compartment.
 * Such code must be executed in a guest compartment.
 * As such, it is irrelevant that the globalThis is mutable and also holds all
 * of the host's authority.
 *
 * Pass-style may be loaded into a guest compartment, and the globalThis of the
 * compartment may or may not be frozen.
 * We typically, as with importBundle, run every Node.js package in a dedicated
 * compartment with a gratuitiously frozen globalThis.
 * In this configuration, we can rely on globalThis.Error and
 * globalThis.TypeError to correspond to the realm's intrinsics, either because
 * the Compartment arranged for a frozen globalThis or because the pass-style
 * package provides no code that can arrange for a change to the compartment's
 * globalThis.
 *
 * Running multiple guests in a single compartment with an unfrozen globalThis
 * is incoherent and provides no assurance of mutual safety between those
 * guests.
 * No code, much less Pass-style, should be run in such a compartment.
 *
 * Although we can rely on the globalThis.Error and globalThis.TypeError
 * bindings, we can and do use `makeTypeError` to produce a TypeError instance
 * that is guaranteed to be an instance of the realm intrinsic by dint of
 * construction from language syntax.
 * The idiom "belt and suspenders" is well-known among the authors and means
 * gratuitous or redundant safety measures.
 * In this case, we wear both belt and suspenders *on our overalls*.
 *
 * @returns {TypeError}
 */
const makeTypeError = () => {
  try {
    // @ts-expect-error deliberate TypeError
    null.null;
    throw TypeError('obligatory'); // To convince the type flow inferrence.
  } catch (error) {
    return error;
  }
};

export const makeRepairError = () => {
  if (!hardenIsFake()) {
    return undefined;
  }

  const typeErrorStackDesc = getOwnPropertyDescriptor(makeTypeError(), 'stack');
  const errorStackDesc = getOwnPropertyDescriptor(Error('obligatory'), 'stack');

  if (
    typeErrorStackDesc === undefined ||
    typeErrorStackDesc.get === undefined
  ) {
    return undefined;
  }

  if (
    errorStackDesc === undefined ||
    typeof typeErrorStackDesc.get !== 'function' ||
    typeErrorStackDesc.get !== errorStackDesc.get ||
    typeof typeErrorStackDesc.set !== 'function' ||
    typeErrorStackDesc.set !== errorStackDesc.set
  ) {
    // We have own stack accessor properties that are outside our expectations,
    // that therefore need to be understood better before we know how to repair
    // them.
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR.md
    throw TypeError(
      'Unexpected Error own stack accessor functions (PASS_STYLE_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)',
    );
  }

  // We should otherwise only encounter this case on V8 and possibly immitators
  // like FaceBook's Hermes because of its problematic error own stack accessor
  // behavior, which creates an undeniable channel for communicating arbitrary
  // capabilities through the stack internal slot of arbitrary frozen objects.
  // Note that FF/SpiderMonkey, Moddable/XS, and the error stack proposal
  // all inherit a stack accessor property from Error.prototype, which is
  // great. That case needs no heroics to secure.

  // In the V8 case as we understand it, all errors have an own stack accessor
  // property, but within the same realm, all these accessor properties have
  // the same getter and have the same setter.
  // This is therefore the case that we repair.
  //
  // Also, we expect tht the captureStackTrace proposal to create more cases
  // where error objects have own "stack" getters.
  // https://github.com/tc39/proposal-error-capturestacktrace

  const feralStackGetter = freeze(errorStackDesc.get);

  /** @param {unknown} error */
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

export const repairError = makeRepairError();

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
    // This point is unreachable unless the candidate is mutable and the
    // platform is V8 or like V8 creates errors with an own "stack" getter or
    // setter, which would otherwise make them non-passable.
    // This should only occur with lockdown using unsafe hardenTaming or an
    // equivalent fake, non-actually-freezing harden.
    // Under these circumstances only, passStyleOf alters an object as a side
    // effect, converting the "stack" property to a data value.
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

/** @type {PassStyleHelper} */
export const ErrorHelper = harden({
  styleName: 'error',

  confirmCanBeValid: confirmErrorLike,

  assertRestValid: (candidate, passStyleOfRecur) =>
    confirmRecursivelyPassableError(candidate, passStyleOfRecur, Fail),
});
