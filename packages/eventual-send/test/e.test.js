import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { E, HandledPromise } from './_get-hp.js';

test('E reexports', async t => {
  t.is(E.resolve, HandledPromise.resolve, 'E reexports resolve');
});

test('E.when', async t => {
  /** @type {any} */
  let stash;
  await E.when(123, val => (stash = val));
  t.is(stash, 123, `onfulfilled handler fires`);
  /** @type {any} */
  let raised;
  // eslint-disable-next-line prefer-promise-reject-errors
  await E.when(Promise.reject('foo'), undefined, val => (raised = val));
  t.is(raised, 'foo', 'onrejected handler fires');

  /** @type {any} */
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
  /** @type {any} */
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
  await null;
  const x = {
    double(n) {
      return 2 * n;
    },
    frozenTest(input) {
      t.assert(Object.isFrozen(input), 'input is frozen');
      return { input, ret: 456 };
    },
  };
  const d = E(x).double(6);
  t.is(typeof d.then, 'function', 'return is a thenable');
  t.is(await d, 12, 'method call works');
  const methodProxy = E(x);
  t.assert(Object.isFrozen(methodProxy));
  const output = await methodProxy.frozenTest({ arg: 123 });
  t.assert(Object.isFrozen(output), 'output is frozen');

  const double = methodProxy.double;
  await t.throwsAsync(() => double(6));
  await t.throwsAsync(() => double.call(x, 6));
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
    frozenTest(input) {
      t.assert(Object.isFrozen(input), 'input is frozen');
    },
  };
  const result = E.sendOnly(counter).incr(42);
  t.is(typeof result, 'undefined', 'return is undefined as expected');
  await testIncrDone;
  t.is(count, 42, 'sendOnly method call variant works');
  await E(counter).frozenTest({ arg: 123 });

  const incr = E.sendOnly(counter).incr;
  t.throws(() => {
    incr(42);
  });
  t.throws(() => {
    incr.call(counter, 42);
  });
});

test('E call missing method', async t => {
  const x = {
    double(n) {
      return 2 * n;
    },
  };
  // @ts-expect-error intentional error
  await t.throwsAsync(() => E(x).triple(6), {
    message: 'target has no method "triple", has ["double"]',
  });
});

test('E sendOnly call missing method', async t => {
  let count = 279;
  const counter = {
    incr(n) {
      count += n;
      return count;
    },
  };

  // @ts-expect-error intentional error
  const result = E.sendOnly(counter).decr(210);
  t.is(result, undefined, 'return is undefined as expected');
  await null;
  t.is(count, 279, `sendOnly method call doesn't change count`);
});

test('E call undefined method', async t => {
  const x = {
    double(n) {
      return 2 * n;
    },
  };
  // @ts-expect-error intentional error
  await t.throwsAsync(() => E(x)(6), {
    message: 'Cannot invoke target as a function; typeof target is "object"',
  });
});

test('E invoke a non-method', async t => {
  const x = { double: 24 };
  // @ts-expect-error intentional error
  await t.throwsAsync(() => E(x).double(6), {
    message: 'invoked method "double" is not a function; it is a "number"',
  });
});

test('E method call undefined receiver', async t => {
  // @ts-expect-error intentional error
  await t.throwsAsync(() => E(undefined).double(6), {
    message: 'Cannot deliver "double" to target; typeof target is "undefined"',
  });
});

test('E shortcuts', async t => {
  await null;
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
  await null;
  const x = {
    name: 'buddy',
    val: 123,
    testFrozen: input => {
      t.assert(Object.isFrozen(input), 'input is frozen');
      return { input, ret: 456 };
    },
    output: { ret: 456 },
    y: Object.freeze({
      val2: 456,
      name2: 'holly',
      fn: n => 2 * n,
    }),
    hello(greeting) {
      return `${greeting}, ${this.name}!`;
    },
  };
  t.assert(Object.isFrozen(await E.get(x).output), 'get output is frozen');
  t.assert(
    Object.isFrozen(await E(E.get(x).testFrozen)({ arg: 123 })),
    'function apply output is frozen',
  );
  t.is(
    await E(await E.get(await E.get(x).y).fn)(4),
    8,
    'anonymous method works',
  );
  t.is(await E.get(x).val, 123, 'property get');
});
