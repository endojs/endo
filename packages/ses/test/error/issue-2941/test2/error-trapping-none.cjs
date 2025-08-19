/* eslint-disable no-restricted-globals */
/* global require */
// @ts-ignore
require('../ses.notjs');

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'shorten-paths',
  errorTrapping: 'none',
});

throw Error(`Does this place have an
  echo?
  `);
