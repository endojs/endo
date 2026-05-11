// @ts-nocheck - Test file with mock iterators

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { makeRefIterator } from '../../ref-iterator.js';

test('makeRefIterator creates async iterable iterator', t => {
  const mockIterator = Far('MockIterator', {
    next: async () => ({ value: 1, done: false }),
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  t.truthy(iterator);
  t.is(typeof iterator.next, 'function');
  t.is(typeof iterator.return, 'function');
  t.is(typeof iterator.throw, 'function');
  t.is(typeof iterator[Symbol.asyncIterator], 'function');
});

test('makeRefIterator is self-referential for Symbol.asyncIterator', t => {
  const mockIterator = Far('MockIterator', {
    next: async () => ({ value: 1, done: false }),
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  t.is(iterator[Symbol.asyncIterator](), iterator);
});

test('makeRefIterator.next proxies to remote iterator', async t => {
  const values = [1, 2, 3];
  let index = 0;

  const mockIterator = Far('MockIterator', {
    next: async () => {
      if (index < values.length) {
        const value = values[index];
        index += 1;
        return { value, done: false };
      }
      return { value: undefined, done: true };
    },
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);

  const first = await iterator.next();
  t.deepEqual(first, { value: 1, done: false });

  const second = await iterator.next();
  t.deepEqual(second, { value: 2, done: false });

  const third = await iterator.next();
  t.deepEqual(third, { value: 3, done: false });

  const fourth = await iterator.next();
  t.deepEqual(fourth, { value: undefined, done: true });
});

test('makeRefIterator.return proxies to remote iterator', async t => {
  let returnCalled = false;

  const mockIterator = Far('MockIterator', {
    next: async () => ({ value: 1, done: false }),
    return: async value => {
      returnCalled = true;
      return { value, done: true };
    },
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  const result = await iterator.return('done');

  t.true(returnCalled);
  t.deepEqual(result, { value: 'done', done: true });
});

test('makeRefIterator.throw proxies to remote iterator', async t => {
  let thrownError = null;

  const mockIterator = Far('MockIterator', {
    next: async () => ({ value: 1, done: false }),
    return: async () => ({ value: undefined, done: true }),
    throw: async error => {
      thrownError = error;
      return { value: undefined, done: true };
    },
  });

  const iterator = makeRefIterator(mockIterator);
  const testError = new Error('test error');
  await iterator.throw(testError);

  t.is(thrownError, testError);
});

test('makeRefIterator works with for-await-of', async t => {
  const values = ['a', 'b', 'c'];
  let index = 0;

  const mockIterator = Far('MockIterator', {
    next: async () => {
      if (index < values.length) {
        const value = values[index];
        index += 1;
        return { value, done: false };
      }
      return { value: undefined, done: true };
    },
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  const collected = [];

  for await (const value of iterator) {
    collected.push(value);
  }

  t.deepEqual(collected, ['a', 'b', 'c']);
});

test('makeRefIterator passes arguments to next', async t => {
  let receivedArg = null;

  const mockIterator = Far('MockIterator', {
    next: async arg => {
      receivedArg = arg;
      return { value: arg, done: false };
    },
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  const result = await iterator.next('test-arg');

  t.is(receivedArg, 'test-arg');
  t.deepEqual(result, { value: 'test-arg', done: false });
});

test('makeRefIterator is hardened', t => {
  const mockIterator = Far('MockIterator', {
    next: async () => ({ value: 1, done: false }),
    return: async () => ({ value: undefined, done: true }),
    throw: async () => ({ value: undefined, done: true }),
  });

  const iterator = makeRefIterator(mockIterator);
  t.true(Object.isFrozen(iterator));
});
