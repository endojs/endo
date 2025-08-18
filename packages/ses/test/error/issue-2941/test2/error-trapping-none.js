/* global require */
// eslint-disable-next-line import/no-extraneous-dependencies
require('ses');

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  errorTrapping: 'none',
});

throw Error(`Does this place have an
  echo?
  `);
