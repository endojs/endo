/* global require */
/* eslint-disable no-restricted-globals */
// @ts-ignore
require('../ses.notjs');

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
