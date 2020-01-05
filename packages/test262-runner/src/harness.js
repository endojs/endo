import fs from 'fs';
import path from 'path';
import url from 'url';

const relativeTestHarnessPath = '../test262/harness';
const alwaysInclude = ['assert.js', 'sta.js'];

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The full path to the harness directory.
 */
export function getHarnessPath() {
  return path.join(__dirname, relativeTestHarnessPath);
}

/**
 * Read a single harness files.
 */
function readTestInclude(harnessPath, include) {
  const filePath = path.join(harnessPath, include);
  const contents = fs.readFileSync(filePath, 'utf-8');
  return contents;
}

/**
 * Collect all harness files for a given test.
 */
export function makeHarness(testInfo) {
  let harness = '';

  const harnessPath = getHarnessPath();

  for (const include of alwaysInclude) {
    harness += readTestInclude(harnessPath, include);
  }

  if (Array.isArray(testInfo.includes)) {
    for (const include of testInfo.includes) {
      harness += readTestInclude(harnessPath, include);
    }
  }

  return harness;
}
