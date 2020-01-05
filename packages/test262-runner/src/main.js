/**
 * This test executes all tests found in the root test262/test
 * directory, except tests designated to be skipped by path or
 * by the description in their front matter.
 */
import path from 'path';
import url from 'url';
import { getJSFiles, readTestInfo } from './file.js';
import { hasExcludedInfo, hasExcludedPath } from './checks.js';
import { skipTest, runTest } from './test.js';

export { captureGlobals } from './utilities.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main.
 */
export default async function test262Runner(options) {
  const { testDirs } = options;

  for await (const testDir of testDirs) {
    const testRoot = path.join(__dirname, '../test262', testDir);
    for await (const filePath of getJSFiles(testRoot)) {
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
}
