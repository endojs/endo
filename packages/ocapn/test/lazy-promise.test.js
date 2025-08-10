import test from '@endo/ses-ava/prepare-endo.js';
import { isPromise, makePromiseKit } from '@endo/promise-kit';
import { LazyPromise } from '../src/lazy-promise.js';

test('isPromise is false (sad but true)', t => {
  const promise = new LazyPromise(() => {});
  t.is(isPromise(promise), false);
});

test('instanceof Promise', t => {
  const promise = new LazyPromise(() => {});
  t.is(promise instanceof Promise, true);
});

test('.then', t => {
  let executorCalled = false;
  let resolve;
  const promise = new LazyPromise(res => {
    resolve = res;
    executorCalled = true;
  });
  t.is(executorCalled, false);
  promise.then(() => {});
  t.is(executorCalled, true);
  resolve();
  t.is(executorCalled, true);
});

test('.catch', t => {
  let executorCalled = false;
  let resolve;
  const promise = new LazyPromise(res => {
    resolve = res;
    executorCalled = true;
  });
  t.is(executorCalled, false);
  promise.catch(() => {});
  t.is(executorCalled, true);
  resolve();
  t.is(executorCalled, true);
});

test('.finally', t => {
  let executorCalled = false;
  let resolve;
  const promise = new LazyPromise(res => {
    resolve = res;
    executorCalled = true;
  });
  t.is(executorCalled, false);
  promise.finally(() => {});
  t.is(executorCalled, true);
  resolve();
});

test('await', async t => {
  let executorCalled = false;
  let resolve;
  const promise = new LazyPromise(res => {
    resolve = res;
    executorCalled = true;
  });
  t.is(executorCalled, false);
  // Make a normal promise kit to control the async function
  const { promise: readyP, resolve: ready } = makePromiseKit();
  // Kick off an async function that will await the lazy promise
  (async () => {
    ready();
    await promise;
  })();
  // Wait for the async function to start
  await readyP;
  t.is(executorCalled, true);
  resolve();
});

test('.catch + reject', t => {
  let executorCalled = false;
  let reject;
  const promise = new LazyPromise((res, rej) => {
    reject = rej;
    executorCalled = true;
  });
  t.is(executorCalled, false);
  promise.catch(() => {});
  t.is(executorCalled, true);
  reject();
  t.is(executorCalled, true);
});

test('Promise.resolve', async t => {
  let executorCalled = false;
  const promise = new LazyPromise(res => {
    executorCalled = true;
  });
  t.is(executorCalled, false);
  // Wait a tick for consistent pattern.
  await Promise.resolve();
  t.is(executorCalled, false);
  // Setup listener
  Promise.resolve(promise);
  // Not listening yet...
  t.is(executorCalled, false);
  // Need to wait a tick.
  await Promise.resolve();
  t.is(executorCalled, true);
});
