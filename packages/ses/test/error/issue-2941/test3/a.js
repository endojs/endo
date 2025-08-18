/* global require */
// eslint-disable-next-line import/no-extraneous-dependencies
require('ses');

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
});
try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
