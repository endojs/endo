import '../../../../index.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'concise',
  errorTrapping: 'platform',
});

throw Error(`Does this place have an
  echo?
`);
