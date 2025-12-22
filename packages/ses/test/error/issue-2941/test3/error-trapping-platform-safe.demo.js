import '../../../../index.js';

lockdown({
  errorTaming: 'safe',
  stackFiltering: 'concise',
  errorTrapping: 'platform',
});

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
