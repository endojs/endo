// eslint-disable-next-line import/no-extraneous-dependencies
import { readTestInclude } from './file';

const alwaysInclude = ['assert.js', 'sta.js'];

export function getHarness(testInfo) {
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
