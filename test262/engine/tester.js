// eslint-disable-next-line import/no-extraneous-dependencies
import tap from 'tap';
import Evaluator from '../../src/evaluator';
import { getHarness } from './harness';
import { applyCorrection } from './corrections';
import { isExcludedError } from './error';

/**
 * Create a skipped test. At truntime, the skipped test will be
 * listed and prefixed by `# SKIP`, allowing for easy monitoring.
 * Only the filename is displayed in the output.
 */
export function skipTest(testInfo, displayPath) {
  tap.test(displayPath, { skip: true });
}

/**
 * Create and execute a test using a new module importer. The test
 * filemane, esid, and description are displayed in the output.
 */
export function runTest(testInfo, displayPath) {
  tap.test(displayPath, t => {
    // Provide information about the test.
    if (
      typeof testInfo === 'object' &&
      typeof testInfo.description === 'string'
    ) {
      const esid = testInfo.esid || '(no esid)';
      const description = testInfo.description || '(no description)';
      t.comment(`${esid}: ${description}`);
    }

    try {
      const evaluator = new Evaluator();
      const harness = getHarness(testInfo);
      evaluator.evaluateScript(
        applyCorrection(`${harness}\n${testInfo.contents}`),
      );
    } catch (e) {
      if (testInfo.negative) {
        if (e.constructor.name !== testInfo.negative.type) {
          // Display the unexpected error.
          t.error(e, 'unexpected error');
        } else {
          // Diplay that the error matched.
          t.pass(`should throw ${testInfo.negative.type}`);
        }
      } else if (isExcludedError(e)) {
        t.skip(e);
      } else {
        // Only negative tests are expected to throw.
        t.error(e, 'should not throw');
      }
    } finally {
      t.end();
    }
  });
}
