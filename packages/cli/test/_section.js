/** @import {Execa} from 'execa' */
/** @import {t} from 'ava' */
/** @import {TestRoutine} from './types' */

/**
 * Transforms a testRoutine into an ava test.
 * The testCommand function asserts that a given awaitable command produces the expected stdout and stderr.
 *
 * An absent `expectation.stdout` defaults to the empty string.
 * An absent `expectation.stderr` now defaults to an accept-anything regexp
 * in order to tolerate extra tool-generated noise that happens, for example,
 * when run under a vscode JavaScript Debug Terminal
 * @see https://github.com/endojs/endo/issues/2702
 *
 * @param {Execa} execa - the command execution environment
 * @param {TestRoutine} testRoutine - the test logic implementation
 * @returns {(t: t) => Promise<void>}
 */
export function makeSectionTest(execa, testRoutine) {
  return async t => {
    const matchExpecation = (expectation, result, errMsg) => {
      (expectation instanceof RegExp ? t.regex : t.is)(
        result,
        expectation,
        errMsg,
      );
    };
    const testCommand = async (command, expectation) => {
      const result = await command;
      if (expectation !== undefined) {
        const errMsg = JSON.stringify({ expectation, result }, null, 2);
        matchExpecation(expectation.stdout ?? '', result.stdout, errMsg);
        matchExpecation(expectation.stderr ?? /.*/, result.stderr, errMsg);
      }
    };
    await testRoutine(execa, testCommand);
  };
}
