import { makeQueue } from '@endo/stream';

/** @import { AsyncQueue } from '@endo/stream' */
/** @import { SerialJobs } from './types.js' */

/**
 * @returns {SerialJobs}
 */
export const makeSerialJobs = () => {
  /** @type {AsyncQueue<void>} */
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
