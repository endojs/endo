// @ts-check

import {
  FERAL_FUNCTION,
  apply,
  getOwnPropertyNames,
  // preventExtensions,
  arrayJoin,
  Set,
  globalThis,
} from './commons.js';

// // This should be necessary for sealing the environment, but for now it fails tests
// let tried = false;
// const attemptMakingGlobalThisNonExtensible = () => {
//   if (tried) {
//     return;
//   }
//   try {
//     preventExtensions(globalThis);
//   } catch (e) {
//     /* empty */
//   }
//   tried = true;
// };

/**
 * makeEvaluate()
 * Create an 'evaluate' function with the correct optimizer inserted.
 *
 * @param {object} context
 * @param {object} context.evalScope
 * @param {object} context.moduleLexicals
 * @param {object} context.globalObject
 * @param {object} context.scopeTerminator
 */
export const makeEvaluate = context => {
  'use strict';

  const SCOPE_TERMINATOR_KEYS = arrayJoin(
    [
      ...new Set([
        ...getOwnPropertyNames(globalThis),
        ...getOwnPropertyNames(context.globalObject),
      ]),
    ],
    ',',
  );
  const MODULE_LEXICAL_KEYS = arrayJoin(
    getOwnPropertyNames(context.moduleLexicals),
    ',',
  );

  return function evaluate(code) {
    'use strict';

    context.evalScope.eval; // required by make-safe-evaluator.

    return apply(
      FERAL_FUNCTION(
        `{${SCOPE_TERMINATOR_KEYS}}`,
        `{${MODULE_LEXICAL_KEYS}}`,
        `return (function () {
          'use strict';
          ${code}
        }).bind(this)();`,
      ),
      this,
      [context.globalObject, context.moduleLexicals],
    );
  };
};
