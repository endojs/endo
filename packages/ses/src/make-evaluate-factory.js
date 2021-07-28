import { FERAL_FUNCTION, arrayJoin } from './commons.js';

/**
 * buildOptimizer()
 * Given an array of indentifier, the optimizer return a `const` declaration
 * destructring `this`.
 *
 * @param {Array<string>} constants
 */
function buildOptimizer(constants) {
  // No need to build an optimizer when there are no constants.
  if (constants.length === 0) return '';
  // Use 'this' to avoid going through the scope proxy, which is unecessary
  // since the optimizer only needs references to the safe global.
  return `const {${arrayJoin(constants, ',')}} = this;`;
}

/**
 * makeEvaluateFactory()
 * The factory create 'evaluate' functions with the correct optimizer
 * inserted.
 *
 * @param {Array<string>} [constants]
 */
export const makeEvaluateFactory = (constants = []) => {
  const optimizer = buildOptimizer(constants);

  // Create a function in sloppy mode, so that we can use 'with'. It returns
  // a function in strict mode that evaluates the provided code using direct
  // eval, and thus in strict mode in the same scope. We must be very careful
  // to not create new names in this scope

  // 1: we use 'with' (around a Proxy) to catch all free variable names. The
  // `this` value holds the Proxy which safely wraps the safeGlobal
  // 2: 'optimizer' catches constant variable names for speed.
  // 3: The inner strict function is effectively passed two parameters:
  //    a) its arguments[0] is the source to be directly evaluated.
  //    b) its 'this' is the this binding seen by the code being
  //       directly evaluated (the globalObject).
  // 4: The outer sloppy function is passed one parameter, the scope proxy.
  //    as the `this` parameter.

  // Notes:
  // - everything in the 'optimizer' string is looked up in the proxy
  //   (including an 'arguments[0]', which points at the Proxy).
  // - keywords like 'function' which are reserved keywords, and cannot be
  //   used as a variable, so they are not part of the optimizer.
  // - when 'eval' is looked up in the proxy, and it's the first time it is
  //   looked up after allowNextEvalToBeUnsafe is turned on, the proxy returns
  //   the powerful, unsafe eval intrinsic, and flips allowNextEvalToBeUnsafe
  //   back to false. Any reference to 'eval' in that string will get the tamed
  //   evaluator.

  // TODO https://github.com/endojs/endo/issues/816
  // The optimizer currently runs under sloppy mode, and although we doubt that
  // there is any vulnerability introduced just by running the optimizer
  // sloppy, we are much more confident in the semantics of strict mode.
  // The motivation for having the optimizer in sloppy mode is that it can be
  // reused for multiple evaluations, but in practice we have no such calls.
  // We could probably both move the optimizer into the inner function
  // and we could also simplify makeEvaluateFactory to simply evaluate.
  return FERAL_FUNCTION(`
    with (this) {
      ${optimizer}
      return function() {
        'use strict';
        return eval(arguments[0]);
      };
    }
  `);
};
