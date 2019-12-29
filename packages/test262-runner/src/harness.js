import fs from 'fs';
import path from 'path';

const relativeTestHarnessPath = '../test262/harness';
const alwaysInclude = ['assert.js', 'sta.js'];

/**
 * The full path to the harness directory.
 */
function getHarnessPath() {
  return path.join(__dirname, relativeTestHarnessPath);
}

/**
 * Read a single harness files.
 */
function readTestInclude(include) {
  const harnessPath = getHarnessPath();
  const filePath = path.join(harnessPath, include);
  const contents = fs.readFileSync(filePath, 'utf-8');
  return contents;
}

/**
 * Collect all harness files for a given test.
 */
export function makeHarness(testInfo) {
  let harness = '';

  for (const include of alwaysInclude) {
    harness += readTestInclude(include);
  }

  if (Array.isArray(testInfo.includes)) {
    for (const include of testInfo.includes) {
      harness += readTestInclude(include);
    }
  }

  return harness;
}
