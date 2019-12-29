/**
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */
import { getJSFiles, readTestInfo } from './file';
import { hasExcludedInfo, hasExcludedPath } from './checks';
import { skipTest, runTest } from './test';

export { default as test262Updater } from './updater';
export { captureGlobals } from './utilities';

/**
 * Main.
 */
export default async function test262Runner(options) {
  const { testRootPath } = options;

  for await (const filePath of getJSFiles(testRootPath)) {
    const testInfo = readTestInfo(options, filePath);
    if (
      hasExcludedPath(options, filePath) ||
      hasExcludedInfo(options, testInfo)
    ) {
      skipTest(options, testInfo);
    } else {
      runTest(options, testInfo);
    }
  }
}
