// @ts-check
/* eslint-disable require-yield, no-empty-function */

import '@endo/init/debug.js';

import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';
import { prime } from '../index.js';

const test = wrapTest(rawTest);

test('prime single next', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* single() {
    t.is(yield, 0);
  }

  const iterator = prime(single());
  const { done, value } = await iterator.next(0);
  t.is(done, true);
  t.is(value, undefined);
});

test('prime single return', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* empty() {
    return 'Z';
  }

  const iterator = prime(empty());
  const { done, value } = await iterator.return(0);
  t.is(done, true);
  t.is(value, 'Z');
});

test('prime empty throw in', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* empty() {
    return 'Z';
  }

  const iterator = prime(empty());
  try {
    await iterator.throw(new Error('Abort'));
    t.fail();
  } catch (error) {
    t.is(error.message, 'Abort');
  }
});

test('prime single throw in', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* single() {
    try {
      t.is(yield, 0);
    } catch (error) {
      t.is(error.message, 'Abort');
      return 'Z';
    }
    return 'A';
  }

  const iterator = prime(single());
  const { done, value } = await iterator.throw(new Error('Abort'));
  t.is(done, true);
  t.is(value, 'Z');
});

test('prime single throw', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* empty() {
    throw new Error('Abort');
  }

  const iterator = prime(empty());
  try {
    await iterator.next(0);
    t.fail('reached beyond end of generator');
  } catch (error) {
    t.is(error.message, 'Abort');
  }
});

test('prime empty case', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* empty() {}

  const iterator = prime(empty());
  const { done, value } = await iterator.next();
  t.is(done, true);
  t.is(value, undefined);
});

test('prime throw case', async (/** @type {import('ava').ExecutionContext} */ t) => {
  async function* temperamental() {
    throw new Error('Abort');
  }

  const iterator = prime(temperamental());
  try {
    await iterator.next();
    t.fail();
  } catch (error) {
    t.is(error.message, 'Abort');
  }
});
