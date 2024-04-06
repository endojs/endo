/* eslint-disable max-classes-per-file */
import test from '@endo/ses-ava/prepare-endo.js';

import { makeError } from '@endo/errors';
import {
  passStyleOf,
  isPassable,
  toPassableError,
} from '../src/passStyleOf.js';

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

  // May not be true on all platforms, depending on what "extraneous"
  // properties the host added to the error before `makeError` returned it.
  // If this fails, please let us know. See the doccomment on the
  // `sanitizeError` function is the ses-shim's `assert.js`.
  t.is(e, e2);
});
