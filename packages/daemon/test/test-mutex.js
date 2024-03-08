/* global setTimeout */
import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

import { makeMutex } from '../src/mutex.js';

const test = wrapTest(rawTest);

const delay = () => new Promise(resolve => setTimeout(resolve, 1));

test('releases lock in expected order (sync functions)', async t => {
  const mutex = makeMutex();
  const results = [];

  await Promise.all([
    mutex.enqueue(() => {
      results.push(1);
    }),
    mutex.enqueue(() => {
      results.push(2);
    }),
    mutex.enqueue(() => {
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('releases lock in expected order (async functions)', async t => {
  const mutex = makeMutex();
  const results = [];

  await Promise.all([
    mutex.enqueue(async () => {
      results.push(1);
    }),
    mutex.enqueue(async () => {
      results.push(2);
    }),
    mutex.enqueue(async () => {
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('releases lock in expected order (async functions with await)', async t => {
  const mutex = makeMutex();
  const results = [];

  await Promise.all([
    mutex.enqueue(async () => {
      await delay();
      results.push(1);
    }),
    mutex.enqueue(async () => {
      await delay();
      results.push(2);
    }),
    mutex.enqueue(async () => {
      await delay();
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('immediately releases the lock to the awaiter', async t => {
  const mutex = makeMutex();
  const results = [];

  await Promise.all([
    mutex.enqueue(async () => {
      await delay();
      results.push(2);
    }),
    (async () => {
      results.push(1);
      await mutex.enqueue(() => delay());
      results.push(3);
    })(),
    mutex.enqueue(async () => {
      results.push(4);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3, 4]);
});
