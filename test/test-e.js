// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { E, HandledPromise } from './get-hp';

test('E reexports', async t => {
  t.is(E.resolve, HandledPromise.resolve, 'E reexports resolve');
});

test('E.when', async t => {
  let stash;
  await E.when(123, val => (stash = val));
  t.is(stash, 123, `onfulfilled handler fires`);
  let raised;
  // eslint-disable-next-line prefer-promise-reject-errors
  await E.when(Promise.reject('foo'), undefined, val => (raised = val));
  t.assert(raised, 'foo', 'onrejected handler fires');

  let ret;
  let exc;
  await E.when(
    Promise.resolve('foo'),
    val => (ret = val),
    val => (exc = val),
  );
  t.is(ret, 'foo', 'onfulfilled option fires');
  t.is(exc, undefined, 'onrejected option does not fire');

  let ret2;
  let exc2;
  await E.when(
    // eslint-disable-next-line prefer-promise-reject-errors
    Promise.reject('foo'),
    val => (ret2 = val),
    val => (exc2 = val),
  );
  t.is(ret2, undefined, 'onfulfilled option does not fire');
  t.is(exc2, 'foo', 'onrejected option fires');
});

test('E method calls', async t => {
  const x = {
    double(n) {
      return 2 * n;
    },
  };
  const d = E(x).double(6);
  t.is(typeof d.then, 'function', 'return is a thenable');
  t.is(await d, 12, 'method call works');
});

test('E sendOnly method calls', async t => {
  let testIncrDoneResolve;
  const testIncrDone = new Promise(resolve => {
    testIncrDoneResolve = resolve;
  });

  let count = 0;
  const counter = {
    incr(n) {
      count += n;
      testIncrDoneResolve(); // only here for the test.
      return count;
    },
  };
  const result = E.sendOnly(counter).incr(42);
  t.is(typeof result, 'undefined', 'return is undefined as expected');
  await testIncrDone;
  t.is(count, 42, 'sendOnly method call variant works');
});

test('E call missing method', async t => {
  const x = {
    double(n) {
      return 2 * n;
    },
  };
  await t.throwsAsync(() => E(x).triple(6), {
    message: 'target has no method "triple", has ["double"]',
  });
});

test.skip('E sendOnly call missing method', async t => {
  let testDecrDoneResolve;
  const testDecrDone = new Promise(resolve => {
    testDecrDoneResolve = resolve;
  });

  let count = 279;
  const counter = {
    incr(n) {
      count += n;
      testDecrDoneResolve(); // only here for the test
      return count;
    },
  };

  t.throwsAsync(
    async () => {
      E.sendOnly(counter).decr(210);
      await testDecrDone;
    },
    {
      message: 'target has no method "decr", has ["incr"]',
    },
  );
});

test('E call undefined method', async t => {
  const x = {
    double(n) {
      return 2 * n;
    },
  };
  await t.throwsAsync(() => E(x)(6), {
    message: 'Cannot invoke target as a function; typeof target is "object"',
  });
});

test('E invoke a non-method', async t => {
  const x = { double: 24 };
  await t.throwsAsync(() => E(x).double(6), {
    message: 'invoked method "double" is not a function; it is a "number"',
  });
});

test('E method call undefined receiver', async t => {
  await t.throwsAsync(() => E(undefined).double(6), {
    message: 'Cannot deliver "double" to target; typeof target is "undefined"',
  });
});

test('E shortcuts', async t => {
  const x = {
    name: 'buddy',
    val: 123,
    y: Object.freeze({
      val2: 456,
      name2: 'holly',
      fn: n => 2 * n,
    }),
    hello(greeting) {
      return `${greeting}, ${this.name}!`;
    },
  };
  t.is(await E(x).hello('Hello'), 'Hello, buddy!', 'method call works');
  t.is(
    await E(await E.get(await E.get(x).y).fn)(4),
    8,
    'anonymous method works',
  );
  t.is(await E.get(x).val, 123, 'property get');
});

test('E.get', async t => {
  const x = {
    name: 'buddy',
    val: 123,
    y: Object.freeze({
      val2: 456,
      name2: 'holly',
      fn: n => 2 * n,
    }),
    hello(greeting) {
      return `${greeting}, ${this.name}!`;
    },
  };
  t.is(
    await E(await E.get(await E.get(x).y).fn)(4),
    8,
    'anonymous method works',
  );
  t.is(await E.get(x).val, 123, 'property get');
});
