import fs from 'fs';
import path from 'path';
import { getAbsolutePath } from './file.js';

const relativeTestHarnessPath = '../test262/harness';
const alwaysInclude = ['assert.js', 'sta.js'];

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

  const harnessPath = getAbsolutePath(relativeTestHarnessPath);

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
