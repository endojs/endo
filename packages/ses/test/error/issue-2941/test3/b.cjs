/* global require */
/* eslint-disable no-restricted-globals */
// @ts-ignore
require('../ses.notjs');

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  errorTrapping: 'none',
});
try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
