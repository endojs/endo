import '@endo/init/pre-remoting.js';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe', // 'unsafe-debug'
  overrideTaming: 'severe',
  domainTaming: 'unsafe',
  stackFiltering: 'verbose', // 'concise'
});
