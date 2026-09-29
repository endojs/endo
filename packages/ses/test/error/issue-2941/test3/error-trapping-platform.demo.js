import '../../../../index.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'concise',
  errorTrapping: 'platform',
});

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
