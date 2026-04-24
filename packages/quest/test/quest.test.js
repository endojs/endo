// @ts-nocheck
/* global setTimeout, queueMicrotask */
import test from 'ava';

import { Quest } from '../index.js';

test('resolves to a non-thenable like a normal Promise', async t => {
  const q = new Quest(resolve => resolve(7));
  t.is(await q, 7);
  t.deepEqual(q.shortenHistory, []);
});

test('rejects to an error like a normal Promise', async t => {
  const err = new Error('boom');
  const q = new Quest((_resolve, reject) => reject(err));
  await t.throwsAsync(q, { is: err });
});

test('Symbol.species is Promise so .then returns a plain Promise', async t => {
  const q = new Quest(resolve => resolve(1));
  const derived = q.then(x => x + 1);
  t.false(derived instanceof Quest);
  t.true(derived instanceof Promise);
  t.is(await derived, 2);
});

test('synchronous resolve(thenable) fires a shortening event', async t => {
  const inner = Promise.resolve(42);
  const events = [];
  const q = new Quest(resolve => resolve(inner));
  q.onShorten(target => events.push(target));
  t.is(await q, 42);
  t.deepEqual(events, [inner]);
  t.deepEqual(q.shortenHistory, [inner]);
});

test('asynchronous resolve(thenable) fires a shortening event', async t => {
  const inner = Promise.resolve('async');
  const events = [];
  const q = new Quest(resolve => {
    queueMicrotask(() => resolve(inner));
  });
  q.onShorten(target => events.push(target));
  t.is(await q, 'async');
  t.deepEqual(events, [inner]);
});

test('non-thenable resolution fires no shortening event', async t => {
  const q = new Quest(resolve => resolve(7));
  let fired = false;
  q.onShorten(() => {
    fired = true;
  });
  await q;
  t.false(fired);
});

test('listener is invoked exactly once per shortening (no double delivery)', async t => {
  const inner = Promise.resolve(1);
  const q = new Quest(resolve => resolve(inner));
  let count = 0;
  q.onShorten(() => {
    count += 1;
  });
  await q;
  // Allow any pending microtasks to drain.
  await new Promise(r => setTimeout(r, 0));
  t.is(count, 1);
});

test('late subscribers receive past shortenings via history replay', async t => {
  const inner = Promise.resolve('hi');
  const q = new Quest(resolve => resolve(inner));
  // Wait for the underlying promise to settle before subscribing.
  await q;
  const events = [];
  q.onShorten(target => events.push(target));
  await new Promise(r => setTimeout(r, 0));
  t.deepEqual(events, [inner]);
});

test('transitive shortening through nested Quests is reported', async t => {
  // q1 -> q2 -> q3 -> 'done'
  const q3 = new Quest(resolve =>
    setTimeout(() => resolve('done'), 5),
  );
  const q2 = new Quest(resolve => resolve(q3));
  const q1 = new Quest(resolve => resolve(q2));

  const events = [];
  q1.onShorten(target => events.push(target));

  t.is(await q1, 'done');
  t.deepEqual(events, [q2, q3]);
});

test('Quest containing a non-Quest thenable surfaces only the direct step', async t => {
  const inner = Promise.resolve(99);
  const q = new Quest(resolve => resolve(inner));

  const events = [];
  q.onShorten(target => events.push(target));

  t.is(await q, 99);
  // Native Promise opaque to chain — only the direct shortening is visible.
  t.deepEqual(events, [inner]);
});

test('multiple listeners all receive each event once', async t => {
  const inner = Promise.resolve(1);
  const q = new Quest(resolve => resolve(inner));
  let a = 0;
  let b = 0;
  q.onShorten(() => {
    a += 1;
  });
  q.onShorten(() => {
    b += 1;
  });
  await q;
  await new Promise(r => setTimeout(r, 0));
  t.is(a, 1);
  t.is(b, 1);
});

test('unsubscribe stops further notifications', async t => {
  const events = [];
  let resolveOuter;
  const outer = new Quest(resolve => {
    resolveOuter = resolve;
  });
  const off = outer.onShorten(target => events.push(target));
  off();
  resolveOuter(Promise.resolve('x'));
  await outer;
  await new Promise(r => setTimeout(r, 0));
  t.deepEqual(events, []);
});

test('listener errors do not affect resolution or other listeners', async t => {
  const inner = Promise.resolve('value');
  const q = new Quest(resolve => resolve(inner));
  let secondCalled = false;
  q.onShorten(() => {
    throw new Error('listener boom');
  });
  q.onShorten(() => {
    secondCalled = true;
  });
  t.is(await q, 'value');
  t.true(secondCalled);
});

test('throws TypeError for non-function executor (matches Promise)', t => {
  // @ts-expect-error testing runtime behavior
  t.throws(() => new Quest(null), { instanceOf: TypeError });
});

test('a throwing then-getter rejects the Quest', async t => {
  const evil = {
    get then() {
      throw new Error('evil getter');
    },
  };
  const q = new Quest(resolve => resolve(evil));
  await t.throwsAsync(q, { message: 'evil getter' });
});
