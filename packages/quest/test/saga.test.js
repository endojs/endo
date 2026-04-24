// @ts-nocheck
/* global setTimeout */
/* eslint-disable require-yield */
import test from 'ava';

import { Quest, saga } from '../index.js';

test('saga returns a Quest', t => {
  const q = saga(function* () {
    return 1;
  });
  t.true(q instanceof Quest);
});

test('saga resolves to the generator return value', async t => {
  const q = saga(function* () {
    const a = yield Promise.resolve(2);
    const b = yield Promise.resolve(3);
    return a + b;
  });
  t.is(await q, 5);
});

test('saga propagates synchronous throws from the generator', async t => {
  const err = new Error('sync throw');
  const q = saga(function* () {
    throw err;
    // eslint-disable-next-line no-unreachable
    yield 1;
  });
  await t.throwsAsync(q, { is: err });
});

test('saga injects rejected awaits via gen.throw so try/catch works', async t => {
  const q = saga(function* () {
    try {
      yield Promise.reject(new Error('rejected await'));
      return 'unreached';
    } catch (e) {
      return `caught: ${e.message}`;
    }
  });
  t.is(await q, 'caught: rejected await');
});

test('saga propagates uncaught rejections', async t => {
  const err = new Error('uncaught');
  const q = saga(function* () {
    yield Promise.reject(err);
    return 'unreached';
  });
  await t.throwsAsync(q, { is: err });
});

test('saga reports each yielded thenable as a shortening event', async t => {
  const a = Promise.resolve('a');
  const b = Promise.resolve('b');
  const c = Promise.resolve('c');

  const events = [];
  const q = saga(function* () {
    const x = yield a;
    const y = yield b;
    const z = yield c;
    return x + y + z;
  });
  q.onShorten(target => events.push(target));

  t.is(await q, 'abc');
  t.deepEqual(events, [a, b, c]);
});

test('saga skips non-thenable yields for shortening (still feeds value back)', async t => {
  const a = Promise.resolve('A');
  const events = [];
  const q = saga(function* () {
    const x = yield a;
    const y = yield 'plain';
    return x + y;
  });
  q.onShorten(target => events.push(target));

  t.is(await q, 'Aplain');
  t.deepEqual(events, [a]);
});

test('saga reports a final shortening when the generator returns a thenable', async t => {
  const final = Promise.resolve(99);
  const events = [];
  const q = saga(function* () {
    return final;
  });
  q.onShorten(target => events.push(target));

  t.is(await q, 99);
  t.deepEqual(events, [final]);
});

test('saga forwards transitive shortening of a yielded Quest', async t => {
  // Yielded Quest itself shortens to another Quest before settling.
  const inner = new Quest(resolve =>
    setTimeout(() => resolve('deep'), 5),
  );
  const middle = new Quest(resolve => resolve(inner));

  const events = [];
  const q = saga(function* () {
    const v = yield middle;
    return v.toUpperCase();
  });
  q.onShorten(target => events.push(target));

  t.is(await q, 'DEEP');
  // We see the yielded Quest, then the transitive step it shortened to.
  t.deepEqual(events, [middle, inner]);
});

test('saga starts synchronously like an async function', async t => {
  let entered = false;
  const q = saga(function* () {
    entered = true;
    yield Promise.resolve();
    return 'ok';
  });
  // Body executed up to the first yield before saga() returned.
  t.true(entered);
  t.is(await q, 'ok');
});

test('saga accepts a pre-built generator', async t => {
  function* gen() {
    return (yield Promise.resolve(10)) + 5;
  }
  const q = saga(gen());
  t.is(await q, 15);
});

test('saga rejects when given something that is not a generator', async t => {
  // @ts-expect-error testing runtime behavior
  const q = saga(123);
  await t.throwsAsync(q, { instanceOf: TypeError });
});

test('Symbol.species means saga().then() returns a plain Promise', async t => {
  const q = saga(function* () {
    return 1;
  });
  const derived = q.then(x => x + 1);
  t.false(derived instanceof Quest);
  t.true(derived instanceof Promise);
  t.is(await derived, 2);
});

test('saga forwards generator function arguments', async t => {
  const q = saga(
    function* (a, b) {
      const sum = (yield Promise.resolve(a)) + b;
      return sum;
    },
    10,
    32,
  );
  t.is(await q, 42);
});
