import '../../../../index.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'concise',
  errorTrapping: 'none',
});

throw Error(`Does this place have an
  echo?
`);
