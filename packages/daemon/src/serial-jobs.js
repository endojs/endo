import { makeQueue } from '@endo/stream';

/**
 * @returns {import('./types.js').SerialJobs}
 */
export const makeSerialJobs = () => {
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
