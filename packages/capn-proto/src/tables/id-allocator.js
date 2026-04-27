// @ts-check
/**
 * 32-bit unsigned ID allocator with a free list. Cap'n Proto reuses IDs once
 * both peers have observed a Release/Finish for them.
 */

import { Fail } from '@endo/errors';

const MAX = 0xffffffff;

export const makeIdAllocator = () => {
  let next = 0;
  /** @type {number[]} */
  const free = [];
  return {
    alloc() {
      if (free.length > 0) return /** @type {number} */ (free.pop());
      next <= MAX || Fail`ran out of 32-bit IDs`;
      const id = next;
      next += 1;
      return id;
    },
    release(id) {
      free.push(id);
    },
    /** Number of currently outstanding IDs. */
    outstanding() {
      return next - free.length;
    },
  };
};
