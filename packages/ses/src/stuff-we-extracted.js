import {
  arrayForEach,
  globalThis,
  FERAL_EVAL,
  FERAL_FUNCTION,
  TypeError,
  getOwnPropertyDescriptor,
} from './commons.js';

export function dynamicFunctionPermitsAdjustments({
  FunctionInstance,
  accessor,
}) {
  // While all engines have a ThrowTypeError accessor for fields not permitted in strict mode, some (Hermes 0.12) put that accessor in unexpected places. We can't clean them up because they're non-configurable. Therefore we're checking for identity with specCompliantThrowTypeError and dynamically adding permits for those. If they're configurable, we'll let them be removed later instead.
  // eslint-disable-next-line func-names
  const specCompliantThrowTypeError = (function () {
    'use strict';

    // eslint-disable-next-line prefer-rest-params
    const desc = getOwnPropertyDescriptor(arguments, 'callee');
    return desc && desc.get;
  })();
  if (specCompliantThrowTypeError) {
    // eslint-disable-next-line func-names
    const strict = function () {
      'use strict';
    };
    arrayForEach(['caller', 'arguments'], prop => {
      const desc = getOwnPropertyDescriptor(strict, prop);
      if (
        desc &&
        desc.configurable === false &&
        desc.get &&
        desc.get === specCompliantThrowTypeError
      ) {
        FunctionInstance[prop] = accessor;
      }
    });
  }
}

export const assertDirectEvalAvailable = () => {
  let allowed = false;
  let evaluatorsBlocked = false;
  try {
    allowed = FERAL_FUNCTION(
      'eval',
      'SES_changed',
      `\
        eval("SES_changed = true");
        return SES_changed;
      `,
    )(FERAL_EVAL, false);
    // If we get here and SES_changed stayed false, that means the eval was sloppy
    // and indirect, which generally creates a new global.
    // We are going to throw an exception for failing to initialize SES, but
    // good neighbors clean up.
    if (!allowed) {
      delete globalThis.SES_changed;
    }
  } catch (_error) {
    // We reach here if eval is outright forbidden by a Content Security Policy.
    // We allow this for SES usage that delegates the responsibility to isolate
    // guest code to production code generation.
    evaluatorsBlocked = true;
  }
  if (!allowed && !evaluatorsBlocked) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DIRECT_EVAL.md
    throw TypeError(
      `SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct-eval (dynamically scoped eval) (SES_DIRECT_EVAL)`,
    );
  }
};
