import '../../../../index.js';

lockdown({
  errorTaming: 'safe',
  stackFiltering: 'concise',
  errorTrapping: 'platform',
});

throw Error(`Does this place have an
  echo?
`);
