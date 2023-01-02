import { wrap } from '../../src/async-contexts/6-async-context-transpose.js';

export const makePromiseKit = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return harden({ promise, resolve, reject });
};
harden(makePromiseKit);

export const ResolveThen = (value, onFulfilled = val => val, onRejected) => {
  const { promise, resolve } = makePromiseKit();
  resolve(value);
  return promise.then(wrap(onFulfilled), onRejected ?? wrap(onRejected));
};
harden(ResolveThen);

const { freeze } = Object;

export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
    },
    get() {
      const promise = ResolveThen(tailPromise, next => next.value);
      tailPromise = ResolveThen(tailPromise, next => next.promise);
      return harden(promise);
    },
  };
};
harden(makeQueue);
