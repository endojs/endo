import { makePromiseKit } from '@endo/promise-kit';

export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const next = makePromiseKit();
      const promise = next.promise;
      tailResolve({ value, promise });
      tailResolve = next.resolve;
    },
    get() {
      const promise = tailPromise.then(next => next.value);
      tailPromise = tailPromise.then(next => next.promise);
      return promise;
    },
  };
};

export const makeMutex = () => {
  const queue = makeQueue();
  const lock = () => {
    return queue.get()
  }
  const unlock = () => {
    queue.put()
  }
  unlock()

  return {
    lock,
    unlock,
    // helper for correct usage
    enqueue: async (asyncFn) => {
      await lock()
      try {
        return await asyncFn()
      } finally {
        unlock()
      }
    },
  };
}