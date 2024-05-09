/* eslint-disable max-classes-per-file */
import test from '@endo/ses-ava/prepare-endo.js';

import { makeError } from '@endo/errors';
import {
  passStyleOf,
  isPassable,
  toPassableError,
  toThrowable,
} from '../src/passStyleOf.js';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';

const { defineProperty } = Object;

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

test('toPassableError, toThrowable', t => {
  const e = makeError('test error', undefined, {
    sanitize: false,
  });

  // Remotables cannot be in passable errors or throwables
  defineProperty(e, 'foo', { value: Far('Foo', {}) });

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

  t.true(Object.isFrozen(e));
  t.false(isPassable(e));

  t.true(Object.isFrozen(e2));
  t.true(isPassable(e2));

  t.not(e, e2);
  t.log('passable', e2);

  t.is(e2, toThrowable(e2));
  t.deepEqual(toThrowable(e), e2);

  const notYetCoercable = harden([e]);
  // Note: eventually `toThrowable(notYetCoercable)` should return
  // a throwable singleton copyArray containing a toThrowable(e), i.e.,
  // an error like e2.
  t.throws(() => toThrowable(notYetCoercable), {
    message: 'Passable Error has extra unpassed property "foo"',
  });

  const throwable = harden([e2, { e2 }, makeTagged('e2', e2)]);
  t.is(throwable, toThrowable(throwable));
});

/**
 * Copied from
 * https://github.com/Agoric/agoric-sdk/blob/286302a192b9eb2e222faa08479f496645bb7b9a/packages/internal/src/upgrade-api.js#L25-L39
 * to verify that an UpgradeDisconnection object is throwable, as we need it
 * to be.
 *
 * Makes an Error-like object for use as the rejection reason of promises
 * abandoned by upgrade.
 *
 * @param {string} upgradeMessage
 * @param {number} toIncarnationNumber
 * @returns {UpgradeDisconnection}
 */
const makeUpgradeDisconnection = (upgradeMessage, toIncarnationNumber) =>
  harden({
    name: 'vatUpgraded',
    upgradeMessage,
    incarnationNumber: toIncarnationNumber,
  });

/**
 * Copied from
 * https://github.com/Agoric/agoric-sdk/blob/286302a192b9eb2e222faa08479f496645bb7b9a/packages/internal/test/test-upgrade-api.js#L9
 */
const disconnection = makeUpgradeDisconnection('vat upgraded', 2);

test('UpgradeDisconnection is throwable', t => {
  t.is(toThrowable(disconnection), disconnection);
});
