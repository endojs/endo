// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { pump, prime } from '../index.js';

test('pump happy path', async (/** @type {import('ava').ExecutionContext} */ t) => {
  t.plan(2);

  async function* source() {
    for (let i = 0; i < 4; i += 1) {
      yield i;
    }
    yield* [4, 5, 6];
    return '.';
  }

  async function* target() {
    const collected = [];
    try {
      for (;;) {
        collected.push(yield);
      }
    } catch (error) {
      t.fail(error);
    } finally {
      t.assert(true);
      t.deepEqual(collected, [0, 1, 2, 3, 4, 5, 6]);
    }
  }

  await pump(prime(target()), source());
});

test('pump target closes early', async (/** @type {import('ava').ExecutionContext} */ t) => {
  t.plan(7);

  async function* source() {
    try {
      for (let i = 0; i < 10; i += 1) {
        yield i;
      }
      return 'X';
    } finally {
      t.assert(true);
    }
  }

  async function* target() {
    try {
      for (let i = 0; i < 5; i += 1) {
        t.is(yield, i);
      }
      return 'Y';
    } finally {
      t.assert(true);
    }
  }

  await pump(prime(target()), source());
});

test('pump with error', async (/** @type {import('ava').ExecutionContext} */ t) => {
  t.plan(3);

  async function* source() {
    for (let i = 0; i < 4; i += 1) {
      yield i;
    }
    yield* [4, 5, 6];
    throw Error('Abort');
  }

  const collected = [];

  async function* target() {
    try {
      for (;;) {
        collected.push(yield);
      }
    } catch (error) {
      t.is(error.message, 'Abort');
      t.deepEqual(collected, [0, 1, 2, 3, 4, 5, 6]);
    } finally {
      t.assert(true);
    }
  }

  await pump(prime(target()), source());
});

test('pump iterator protocol happy', async (/** @type {import('ava').ExecutionContext} */ t) => {
  t.plan(22);

  let i = 0;
  const source = {
    /** @param {undefined} value */
    async next(value) {
      t.is(value, undefined);
      if (i < 10) {
        t.log(`->${i},`);
        const next = i;
        i += 1;
        return { value: next, done: false };
      } else {
        t.log(`->X.`);
        return { value: 'X', done: true };
      }
    },
    /** @param {undefined} value */
    async return(value) {
      t.is(value, undefined);
      t.log(`->.`);
      return { value: '?', done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.fail(error.message);
      t.log(`->!`);
      return { value: '!', done: true };
    },
    [Symbol.asyncIterator]() {
      return source;
    },
  };

  let j = 0;
  const target = {
    /** @param {number} value */
    async next(value) {
      t.log(`<-${value},`);
      t.is(value, j);
      j += 1;
      return { value: undefined, done: false };
    },
    /** @param {string} value */
    async return(value) {
      t.log(`<-${value}.`);
      t.is(value, 'X');
      return { value: 'Y', done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`<-${error.message}!`);
      t.fail(error.message);
      return { value: '!', done: true };
    },
    [Symbol.asyncIterator]() {
      return target;
    },
  };

  await pump(target, source);
});

test('pump iterator protocol source next throws', async (/** @type {import('ava').ExecutionContext} */ t) => {
  const source = {
    /** @param {undefined} value */
    async next(value) {
      t.log(`->${value},`);
      throw Error('Abort');
    },
    /** @param {undefined} value */
    async return(value) {
      t.log(`->${value}.`);
      t.fail();
      return { value: '?', done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`->${error.message}!`);
      t.fail();
      return { value: '?', done: true };
    },
    [Symbol.asyncIterator]() {
      return source;
    },
  };

  const target = {
    /** @param {number} value */
    async next(value) {
      t.fail();
      t.log(`<-${value},`);
      return { value: undefined, done: false };
    },
    /** @param {string} value */
    async return(value) {
      t.fail();
      t.log(`<-${value}.`);
      return { value: undefined, done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`<-${error.message}!`);
      t.is(error.message, 'Abort');
      return { value: 'Ack Abort', done: true };
    },
    [Symbol.asyncIterator]() {
      return target;
    },
  };

  await pump(target, source);
});

test('pump iterator protocol target next throws', async (/** @type {import('ava').ExecutionContext} */ t) => {
  const source = {
    /** @param {undefined} value */
    async next(value) {
      t.is(value, 'A');
      t.log(`->${value},`);
      return { value: 0, done: false };
    },
    /** @param {undefined} value */
    async return(value) {
      t.log(`->${value}.`);
      t.fail('source return reached');
      return { value: '?', done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`->${error.message}!`);
      t.is(error.message, 'Abort');
      return { value: 'Ack Abort', done: true };
    },
    [Symbol.asyncIterator]() {
      return source;
    },
  };

  const target = {
    /** @param {number} value */
    async next(value) {
      t.log(`<-${value},`);
      t.is(value, 0);
      throw Error('Abort');
    },
    /** @param {string} value */
    async return(value) {
      t.log(`<-${value}.`);
      t.fail('target return reached');
      return { value: undefined, done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`<-${error.message}!`);
      t.fail('target error reached');
      return { value: '?', done: true };
    },
    [Symbol.asyncIterator]() {
      return target;
    },
  };

  await pump(target, source, 'A');
});

test('pump iterator protocol target return throws', async (/** @type {import('ava').ExecutionContext} */ t) => {
  await null;
  const source = {
    /** @param {undefined} value */
    async next(value) {
      t.is(value, 'A');
      t.log(`->${value},`);
      return { value: 0, done: true };
    },
    /** @param {undefined} value */
    async return(value) {
      t.log(`->${value}.`);
      t.fail('source return reached');
      return { value: '?', done: true };
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`->${error.message}!`);
      t.fail('source throw reached');
      return { value: '?', done: true };
    },
    [Symbol.asyncIterator]() {
      return source;
    },
  };

  const target = {
    /** @param {number} value */
    async next(value) {
      t.log(`<-${value},`);
      t.fail('reached target next');
      return { value: '?', done: true };
    },
    /** @param {number} value */
    async return(value) {
      t.log(`<-${value}.`);
      t.is(value, 0);
      throw Error('Abort');
    },
    /** @param {Error} error */
    async throw(error) {
      t.log(`<-${error.message}!`);
      t.fail('target error reached');
      return { value: '?', done: true };
    },
    [Symbol.asyncIterator]() {
      return target;
    },
  };

  try {
    await pump(target, source, 'A');
    t.fail();
  } catch (error) {
    t.is(error.message, 'Abort');
  }
});
