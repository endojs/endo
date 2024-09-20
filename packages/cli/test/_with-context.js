/** @import {Context, TestRoutine} from '../types' */
/**
 * Creates a wrapper which wraps a test routine with an execa-curried setup and teardown routine.
 *
 * @param {Context} context
 * @returns {(testRoutine: TestRoutine) => TestRoutine}
 */
const makeContextWrapper =
  context => testRoutine => async (execa, testCommand) => {
    await null;
    try {
      await context.setup(execa);
      await testRoutine(execa, testCommand);
    } finally {
      await context.teardown?.(execa);
    }
  };

/**
 * Creates a wrapper which wraps a test routine with execa-curried setup and teardown routines.
 *
 * Context args are provided from outermost to inner-most wrapping, e.g.
 *
 * ```
 * await makeContextWrappers(a, b)(c);
 * ```
 *
 * is approximately equivalent to
 *
 * ```
 * for ( var f of [a.setup, b.setup, c, b.teardown, a.teardown] ) {
 *   await f();
 * }
 * ```
 *
 * with the important distinction that teardown routines execute as long as their corresponding
 * setup was called, even if that setup or any calls in between failed.
 *
 * @param {...Context} contexts - the conjugations to be applied onion-wise
 * @returns {(testRoutine: TestRoutine) => TestRoutine}
 */
export const withContext =
  (...contexts) =>
  testRoutine => {
    let composition = testRoutine;
    for (const context of contexts.reverse()) {
      composition = makeContextWrapper(context)(composition);
    }
    return composition;
  };
