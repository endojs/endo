// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { asyncIterate } from '../async-iterate.js';

/** @import { SomehowAsyncIterable } from '../types.js' */

test('asyncIterate prefers Symbol.asyncIterator', async t => {
  const asyncIterator = {
    async next() {
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  const iterable = {
    [Symbol.asyncIterator]() {
      return asyncIterator;
    },
  };

  const result = asyncIterate(iterable);
  t.is(result, asyncIterator);
});

test('asyncIterate falls back to Symbol.iterator', async t => {
  const iterator = {
    next() {
      return { done: true, value: undefined };
    },
    [Symbol.iterator]() {
      return this;
    },
  };

  const iterable = {
    [Symbol.iterator]() {
      return iterator;
    },
  };

  const result = asyncIterate(iterable);
  t.is(result, iterator);
});

test('asyncIterate accepts iterator objects', async t => {
  const iterator = {
    next() {
      return { done: true, value: undefined };
    },
  };

  const result = asyncIterate(iterator);
  t.is(result, iterator);
});

test('asyncIterate rejects non-iterables', async t => {
  const nonIterable = /** @type {SomehowAsyncIterable<unknown>} */ ({});

  t.throws(() => asyncIterate(nonIterable), {
    instanceOf: TypeError,
    message: 'Expected an iterable or iterator',
  });
});
