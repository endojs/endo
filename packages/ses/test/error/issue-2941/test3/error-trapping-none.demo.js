import '../../../../index.js';

lockdown({
  errorTaming: 'unsafe',
  stackFiltering: 'concise',
  errorTrapping: 'none',
});

try {
  throw Error(`karramba`);
} catch (e) {
  throw Error('que?', { cause: e });
}
