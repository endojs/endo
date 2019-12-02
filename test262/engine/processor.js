import { hasExcludedPath, readTestInfo } from './file';
import { hasExcludedInfo } from './frontmatter';
import { skipTest, runTest } from './tester';

export function processTest(testPath) {
  const testInfo = readTestInfo(testPath);
  if (hasExcludedPath(testPath) || hasExcludedInfo(testInfo)) {
    skipTest(testInfo, testPath);
  } else {
    runTest(testInfo, testPath);
  }
}
