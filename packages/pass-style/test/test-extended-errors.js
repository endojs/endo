/* eslint-disable max-classes-per-file */
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { passStyleOf } from '../src/passStyleOf.js';

test('style of extended errors', t => {
  const e1 = Error('e1');
  t.throws(() => passStyleOf(e1), {
    message: 'Cannot pass non-frozen objects like "[Error: e1]". Use harden()',
  });
  harden(e1);
  t.is(passStyleOf(e1), 'error');

  const e2 = harden(Error('e2', { cause: e1 }));
  t.is(passStyleOf(e2), 'error');

  const u3 = harden(URIError('u3', { cause: e1 }));
  t.is(passStyleOf(u3), 'error');

  if (typeof AggregateError !== 'undefined') {
    // Conditional, to accommodate platforms prior to AggregateError
    const a4 = harden(AggregateError([e2, u3], 'a4', { cause: e1 }));
    t.is(passStyleOf(a4), 'error');
  }
});
