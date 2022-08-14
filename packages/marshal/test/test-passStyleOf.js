import { test } from './prepare-test-env-ava.js';
import { passStyleOf } from '../src/passStyleOf.js';
import { Far } from '../src/make-far.js';
import { makeTagged } from '../src/makeTagged.js';

test('passStyleOf basic success cases', t => {
  // Test in same order as `passStyleOf` for easier maintenance
  t.is(passStyleOf(undefined), 'undefined');
  t.is(passStyleOf('foo'), 'string');
  t.is(passStyleOf(true), 'boolean');
  t.is(passStyleOf(33), 'number');
  t.is(passStyleOf(33n), 'bigint');
  t.is(passStyleOf(Symbol.for('foo')), 'symbol');
  t.is(passStyleOf(Symbol.iterator), 'symbol');
  t.is(passStyleOf(null), 'null');
  t.is(passStyleOf(harden(Promise.resolve(null))), 'promise');
  t.is(passStyleOf(harden([3, 4])), 'copyArray');
  t.is(passStyleOf(harden({ foo: 3 })), 'copyRecord');
  t.is(passStyleOf(harden({ then: 'non-function then ok' })), 'copyRecord');
  t.is(passStyleOf(makeTagged('unknown', undefined)), 'tagged');
  t.is(passStyleOf(Far('foo', {})), 'remotable');
  t.is(passStyleOf(Far('foo', () => 'far function')), 'remotable');
  t.is(passStyleOf(harden(Error('ok'))), 'error');
});

test('some passStyleOf rejections', t => {
  t.throws(() => passStyleOf(Symbol('unique')), {
    message: /Only registered symbols or well-known symbols are passable: "\[Symbol\(unique\)\]"/,
  });
  t.throws(() => passStyleOf({}), {
    message: /Cannot pass non-frozen objects like {}. Use harden\(\)/,
  });

  const prbad1 = Promise.resolve();
  Object.setPrototypeOf(prbad1, { __proto__: Promise.prototype });
  harden(prbad1);
  t.throws(() => passStyleOf(prbad1), {
    message: /"\[Promise\]" - Must inherit from Promise.prototype: "\[Promise\]"/,
  });

  const prbad2 = Promise.resolve();
  prbad2.extra = 'unexpected own property';
  harden(prbad2);
  t.throws(() => passStyleOf(prbad2), {
    message: /{pr} - Must not have any own properties: \["extra"\]/,
  });

  const prbad3 = Promise.resolve();
  Object.defineProperty(prbad3, 'then', { value: () => 'bad then' });
  harden(prbad3);
  t.throws(() => passStyleOf(prbad3), {
    message: /{pr} - Must not have any own properties: \["then"\]/,
  });

  const thenable1 = harden({ then: () => 'thenable' });
  t.throws(() => passStyleOf(thenable1), {
    message: /Cannot pass non-promise thenables/,
  });

  const thenable2 = Far('remote thenable', { then: () => 'thenable' });
  t.throws(() => passStyleOf(thenable2), {
    message: /Cannot pass non-promise thenables/,
  });
});
