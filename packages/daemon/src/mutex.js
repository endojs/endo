import { makeQueue } from '@endo/stream';

/**
 * @returns {import('./types.js').Mutex}
 */
export const makeMutex = () => {
  /** @type {import('@endo/stream').AsyncQueue<void>} */
  const queue = makeQueue();
  const lock = () => {
    return queue.get();
  };
  const unlock = () => {
    queue.put();
  };
  unlock();

  return {
    lock,
    unlock,
    enqueue: async (asyncFn = /** @type {any} */ (async () => {})) => {
      await lock();
      try {
        return await asyncFn();
      } finally {
        unlock();
      }
    },
  };
};
