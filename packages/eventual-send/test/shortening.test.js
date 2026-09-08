import '@endo/lockdown/commit-debug.js';
import test from 'ava';

import { HandledPromise } from './_get-hp.js';

test('subscribeShortening fires synchronously when registered before resolve', t => {
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  /** @type {undefined | ((v: unknown) => void)} */
  let res;
  const hp = new HandledPromise(resolve => {
    res = resolve;
  });
  HandledPromise.subscribeShortening(hp, s => log.push(s));
  t.deepEqual(log, []);
  assert(res);
  res(123);
  t.deepEqual(log, [{ kind: 'fulfilled', value: 123 }]);
});

test('subscribeShortening fulfilled (non-thenable)', async t => {
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  const hp = new HandledPromise(resolve => {
    resolve(42);
  });
  HandledPromise.subscribeShortening(hp, s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'fulfilled', value: 42 }]);
  t.is(await hp, 42);
});

test('subscribeShortening shortened (thenable)', async t => {
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  const inner = Promise.resolve('inner');
  const hp = new HandledPromise(resolve => {
    resolve(inner);
  });
  HandledPromise.subscribeShortening(hp, s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'shortened', value: inner }]);
  t.is(await hp, 'inner');
});

test('subscribeShortening rejected', async t => {
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  const err = Error('x');
  const hp = new HandledPromise((_res, reject) => {
    reject(err);
  });
  HandledPromise.subscribeShortening(hp, s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'rejected', value: err }]);
  await t.throwsAsync(() => hp, { message: 'x' });
});

test('subscribeShortening after settle is async', async t => {
  const hp = new HandledPromise(resolve => {
    resolve(1);
  });
  await hp;
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  HandledPromise.subscribeShortening(hp, s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'fulfilled', value: 1 }]);
});

test('getNextPromiseValue on HandledPromise', async t => {
  const inner = Promise.resolve(99);
  const hp = new HandledPromise(resolve => {
    resolve(inner);
  });
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  HandledPromise.getNextPromiseValue(hp, s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'shortened', value: inner }]);
  t.is(await hp, 99);
});

test('getNextPromiseValue on plain Promise', async t => {
  const p = Promise.resolve(7);
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  HandledPromise.getNextPromiseValue(p, s => log.push(s));
  t.deepEqual(log, []);
  await p;
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'fulfilled', value: 7 }]);
});

test('getNextPromiseValue on non-promise', async t => {
  /** @type {Array<{ kind: string; value: unknown }>} */
  const log = [];
  HandledPromise.getNextPromiseValue('hi', s => log.push(s));
  t.deepEqual(log, []);
  await Promise.resolve();
  t.deepEqual(log, [{ kind: 'fulfilled', value: 'hi' }]);
});

test('subscribeShortening rejects non-handled promises', t => {
  const p = Promise.resolve(1);
  t.throws(() => HandledPromise.subscribeShortening(p, () => {}), {
    instanceOf: TypeError,
  });
});

test('subscribeShortening chaining return value', t => {
  const hp = new HandledPromise(() => {});
  const ret = HandledPromise.subscribeShortening(hp, () => {});
  t.is(ret, hp);
});
