import test from 'ava';
import { makeHarness } from './harness.js';
import { applyCorrections, captureGlobals } from './utilities.js';
import { isExcludedError } from './checks.js';

/*
 * Create a skipped test. At truntime, the skipped test will be
 * listed and prefixed by `# SKIP`, allowing for easy monitoring.
 * Only the filename is displayed in the output.
 */
export function skipTest(options, testInfo) {
  test.skip(testInfo.displayPath, () => {});
}

/*
 * Create and execute a test using a new module importer. The test
 * filemane, esid, and description are displayed in the output.
 */
export function runTest(options, testInfo = {}) {
  test(testInfo.displayPath, async t => {
    // Provide information about the test.
    const { esid = '(no esid)', description = '(no description)' } = testInfo;
    t.log(`${esid}: ${description}`);

    const restoreGlobals = captureGlobals(options);
    try {
      const harness = makeHarness(testInfo);
      await options.test(testInfo, harness, {
        applyCorrections: contents => applyCorrections(options, contents),
      });
      t.pass('done');
    } catch (e) {
      if (testInfo.negative) {
        if (e.constructor.name !== testInfo.negative.type) {
          // Display the unexpected error.
          t.error(e, 'unexpected error');
        } else {
          // Diplay that the error matched.
          t.pass(`should throw ${testInfo.negative.type}`);
        }
      } else if (isExcludedError(options, e)) {
        t.skip(e);
      } else {
        // Only negative tests are expected to throw.
        throw e;
      }
    } finally {
      restoreGlobals();
    }
  });
}
