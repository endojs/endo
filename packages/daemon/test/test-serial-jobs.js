/* global setTimeout */
import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

import { makeSerialJobs } from '../src/serial-jobs.js';

const test = wrapTest(rawTest);

const delay = () => new Promise(resolve => setTimeout(resolve, 1));

test('performs operations in expected order (sync functions)', async t => {
  const serialJobs = makeSerialJobs();
  const results = [];

  await Promise.all([
    serialJobs.enqueue(() => {
      results.push(1);
    }),
    serialJobs.enqueue(() => {
      results.push(2);
    }),
    serialJobs.enqueue(() => {
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('performs operations in expected order (async functions)', async t => {
  const serialJobs = makeSerialJobs();
  const results = [];

  await Promise.all([
    serialJobs.enqueue(async () => {
      results.push(1);
    }),
    serialJobs.enqueue(async () => {
      results.push(2);
    }),
    serialJobs.enqueue(async () => {
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('performs operations in expected order (async functions with await)', async t => {
  const serialJobs = makeSerialJobs();
  const results = [];

  await Promise.all([
    serialJobs.enqueue(async () => {
      await delay();
      results.push(1);
    }),
    serialJobs.enqueue(async () => {
      await delay();
      results.push(2);
    }),
    serialJobs.enqueue(async () => {
      await delay();
      results.push(3);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3]);
});

test('immediately releases the lock to the awaiter', async t => {
  const serialJobs = makeSerialJobs();
  const results = [];

  await Promise.all([
    serialJobs.enqueue(async () => {
      await delay();
      results.push(2);
    }),
    (async () => {
      results.push(1);
      await serialJobs.enqueue(() => delay());
      results.push(3);
    })(),
    serialJobs.enqueue(async () => {
      results.push(4);
    }),
  ]);

  t.deepEqual(results, [1, 2, 3, 4]);
});
