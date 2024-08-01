/* global setTimeout */

import test from '@endo/ses-ava/prepare-endo.js';
import { makePromiseKit } from '@endo/promise-kit';

import {
  makeSyncGrain,
  makeSyncArrayGrain,
  makeSyncGrainMap,
} from '../src/index.js';

import {
  makeReadonlyGrainMapFromRemote,
  makeRemoteGrainMap,
} from '../src/captp.js';

const delay = (duration) => new Promise(resolve => setTimeout(resolve, duration));

// test('canary', async t => { t.pass(); });

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

  const unsubscribe = grain.subscribe((value) => {
    latestSubscribeValue = value;
  });

  // eslint-disable-next-line func-names
  (async function () {
    for await (const value of grain.follow(canceled)) {
      latestFollowValue = value;
    }
  })();
  const cleanup = () => {
    unsubscribe();
    cancel();
  };

  grain.set({ hello: 'world' });
  grain.set({ hello: 123 });
  grain.set({ hello: 123, foo: 'bar' });

  await delay(500);
  cleanup();

  t.deepEqual(latestSubscribeValue, { hello: 123, foo: 'bar' });
  t.deepEqual(latestFollowValue, { hello: 123, foo: 'bar' });
});

test('array grain / subscribe + follow', async t => {
  const { promise: canceled, resolve: cancel } = makePromiseKit();
  const grain = makeSyncArrayGrain();

  let latestSubscribeValue;
  let latestFollowValue;

  const unsubscribe = grain.subscribe((value) => {
    latestSubscribeValue = value;
  });

  // eslint-disable-next-line func-names
  (async function () {
    for await (const value of grain.follow(canceled)) {
      latestFollowValue = value;
    }
  })();
  const cleanup = () => {
    unsubscribe();
    cancel();
  };

  grain.push({ hello: 'world' });
  grain.push({ count: 123 });
  grain.push({ foo: 'bar' });

  await delay(500);
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

test('remote grainMap', async t => {
  // create source grainMap
  const sourceGrainA = makeSyncGrain('hello');
  const sourceGrainB = makeSyncGrain('world');
  const sourceGrainMap = makeSyncGrainMap({
    a: sourceGrainA,
    b: sourceGrainB,
  });
  const sourceGrainMapRemote = makeRemoteGrainMap(sourceGrainMap);
  // --- network boundary ---
  const destGrainMap = makeReadonlyGrainMapFromRemote(sourceGrainMapRemote);
  const destGrainA = destGrainMap.getGrain('a');
  const destGrainB = destGrainMap.getGrain('b');
  // test
  const { promise: canceled, resolve: cancel } = makePromiseKit();
  const followA = destGrainA.follow(canceled);
  const followB = destGrainB.follow(canceled);
  // skip initial uninitialized values
  await followA.next();
  await followB.next();
  // test
  const { value: valueA } = await followA.next();
  const { value: valueB } = await followB.next();
  t.deepEqual(valueA, 'hello');
  t.deepEqual(valueB, 'world');
  // cleanup
  cancel();
});