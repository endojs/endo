// eslint-disable-next-line import/no-extraneous-dependencies
import tap from 'tap';
import { hasExcludedPath, readTestInfo } from './file';
import { hasExcludedInfo } from './frontmatter';
import { excludeErrors } from './test-configuration';
import { test } from './test-program';

export function isExcludedError(errorObject) {
  const error = `${errorObject}`;
  if (excludeErrors.some(exclude => error.startsWith(exclude))) {
    return true;
  }

  return false;
}

/**
 * Create a skipped test. At truntime, the skipped test will be
 * listed and prefixed by `# SKIP`, allowing for easy monitoring.
 * Only the filename is displayed in the output.
 */
export function skipTest(testInfo) {
  tap.test(testInfo.displayPath, { skip: true });
}

/**
 * Create and execute a test using a new module importer. The test
 * filemane, esid, and description are displayed in the output.
 */
export function runTest(testInfo) {
  tap.test(testInfo.displayPath, async t => {
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
      await test(testInfo);
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
        throw e;
      }
    } finally {
      t.end();
    }
  });
}

export function processTest(filePath) {
  const testInfo = readTestInfo(filePath);
  if (hasExcludedPath(filePath) || hasExcludedInfo(testInfo)) {
    skipTest(testInfo);
  } else {
    runTest(testInfo);
  }
}
