import { makeQueue } from '@endo/stream';

/**
 * @returns {{ lock: () => Promise<void>, unlock: () => void, enqueue: (asyncFn: () => Promise<any>) => Promise<any> }}
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
    // helper for correct usage
    enqueue: async asyncFn => {
      await lock();
      try {
        return await asyncFn();
      } finally {
        unlock();
      }
    },
  };
};
