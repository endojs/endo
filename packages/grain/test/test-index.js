import { makePromiseKit } from '@endo/promise-kit';
import { test } from './prepare-test-env-ava.js';
import { makeSyncGrain, makeSyncArrayGrain } from '../src/index.js';

test('grain / set + get', async t => {
  const grain = makeSyncGrain();
  grain.set({ hello: 'world' });
  t.deepEqual(grain.get(), { hello: 'world' });
});

test('grain / subscribe + follow', async t => {
  const { promise: canceled, resolve: cancel } = makePromiseKit();
  const grain = makeSyncGrain();

  let latestSubscribeValue;
  let latestFollowValue;

  const unsubscribe = grain.subscribe((start) => {
    latestSubscribeValue = start;
  })
  ;(async function () {
    for await (const start of grain.follow(canceled)) {
      latestFollowValue = start;
    }
  })()
  const cleanup = () => {
    unsubscribe();
    cancel();
  }

  grain.set({ hello: 'world' });
  grain.set({ hello: 123 });
  grain.set({ hello: 123, foo: 'bar' });

  await new Promise(resolve => setTimeout(resolve, 1000))
  cleanup();

  t.deepEqual(latestSubscribeValue, { hello: 123, foo: 'bar' });
  t.deepEqual(latestFollowValue, { hello: 123, foo: 'bar' });
});

test('array grain / subscribe + follow', async t => {
  const { promise: canceled, resolve: cancel } = makePromiseKit();
  const grain = makeSyncArrayGrain();

  let latestSubscribeValue;
  let latestFollowValue;

  const unsubscribe = grain.subscribe((start) => {
    latestSubscribeValue = start;
  })
  ;(async function () {
    for await (const start of grain.follow(canceled)) {
      latestFollowValue = start;
    }
  })()
  const cleanup = () => {
    unsubscribe();
    cancel();
  }

  grain.push({ hello: 'world' });
  grain.push({ count: 123 });
  grain.push({ foo: 'bar' });

  await new Promise(resolve => setTimeout(resolve, 1000))
  cleanup();

  t.deepEqual(latestSubscribeValue, [
    { hello: 'world' },
    { count: 123 },
    { foo: 'bar' },
  ]);
  t.deepEqual(latestFollowValue, [
    { hello: 'world' },
    { count: 123 },
    { foo: 'bar' },
  ]);
});

