/* global require */
// eslint-disable-next-line import/no-extraneous-dependencies
require('ses');

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
