import test from 'ava';
import '../../index.js';

// This is the demo version of test-aggregate-error-console.js that
// just outputs to the actual console, rather than using the logging console
// to test. Its purpose is to eyeball rather than automated testing.
// It also serves as a demo form of test-error-cause-console.js, since
// it also shows console output for those cases.

lockdown();

test('aggregate error console demo', t => {
  const e3 = Error('e3');
  const e2 = Error('e2', { cause: e3 });
  const u4 = URIError('u4', { cause: e2 });

  const a1 = AggregateError([e3, u4], 'a1', { cause: e2 });
  console.log('log1', a1);
  t.is(a1.cause, e2);
});
