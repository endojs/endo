/* eslint-disable max-classes-per-file */
import test from '@endo/ses-ava/prepare-endo.js';

import { makeError } from '@endo/errors';
import {
  passStyleOf,
  isPassable,
  toPassableError,
} from '../src/passStyleOf.js';

test('style of extended toPassableError errors', t => {
  const e1a = Error('e1a');
  t.throws(() => passStyleOf(e1a), {
    message: 'Cannot pass non-frozen objects like "[Error: e1a]". Use harden()',
  });
  const e1b = toPassableError(e1a);
  t.is(passStyleOf(e1b), 'error');

  const e2 = toPassableError(Error('e2', { cause: e1a }));
  t.is(passStyleOf(e2), 'error');

  const u3 = toPassableError(URIError('u3', { cause: e1a }));
  t.is(passStyleOf(u3), 'error');

  if (typeof AggregateError !== 'undefined') {
    // Conditional, to accommodate platforms prior to AggregateError
    const a4 = toPassableError(AggregateError([e2, u3], 'a4', { cause: e1a }));
    t.is(passStyleOf(a4), 'error');
  }
});

test('style of extended makeError errors', t => {
  const e1 = makeError('e1c');
  t.is(passStyleOf(e1), 'error');

  const e2 = makeError('e2', Error, { cause: e1 });
  t.is(passStyleOf(e2), 'error');

  const u3 = makeError('u3', URIError, { cause: e1 });
  t.is(passStyleOf(u3), 'error');

  if (typeof AggregateError !== 'undefined') {
    // Conditional, to accommodate platforms prior to AggregateError
    const a4 = toPassableError('a4', AggregateError, {
      cause: e1,
      errors: [e2, u3],
    });
    t.is(passStyleOf(a4), 'error');
  }
});

test('toPassableError rejects unfrozen errors', t => {
  const e = makeError('test error', undefined, {
    sanitize: false,
  });
  // I include this test because I was recently surprised that the errors
  // made by `makeError` are not frozen, and therefore not passable.
  // Since then, we changed `makeError` to make reasonable effort
  // to return a passable error by default. But also added the
  // `sanitize: false` option to suppress that.
  t.false(Object.isFrozen(e));
  t.false(isPassable(e));

  // toPassableError hardens, and then checks whether the hardened argument
  // is a passable error.
  const e2 = toPassableError(e);

  t.true(Object.isFrozen(e2));
  t.true(isPassable(e2));
});
