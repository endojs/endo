// @ts-check
/**
 * 32-bit unsigned ID allocator with a free list. Cap'n Proto reuses IDs once
 * both peers have observed a Release/Finish for them.
 *
 * `release` validates that the id was actually allocated and isn't already
 * free — double-free or release of an unallocated id would otherwise let
 * the allocator hand out the same id twice, corrupting the four-tables
 * state (questions/exports/embargoes keyed by id).
 */

import { Fail } from '@endo/errors';

const MAX = 0xffffffff;

export const makeIdAllocator = () => {
  let next = 0;
  /** @type {number[]} */
  const free = [];
  /** @type {Set<number>} */
  const freeSet = new Set();
  return {
    alloc() {
      if (free.length > 0) {
        const id = /** @type {number} */ (free.pop());
        freeSet.delete(id);
        return id;
      }
      next <= MAX || Fail`ran out of 32-bit IDs`;
      const id = next;
      next += 1;
      return id;
    },
    /** @param {number} id */
    release(id) {
      (Number.isInteger(id) && id >= 0 && id < next) ||
        Fail`release: id ${id} is not a valid allocated id`;
      !freeSet.has(id) || Fail`release: double-free of id ${id}`;
      free.push(id);
      freeSet.add(id);
    },
    /** Number of currently outstanding IDs. */
    outstanding() {
      return next - free.length;
    },
  };
};
