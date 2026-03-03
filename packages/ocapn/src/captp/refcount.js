import harden from '@endo/harden';

/**
 * @typedef {import('./types.js').Slot} Slot
 *
 * @typedef {object} RefCounter
 * @property {((specimen: Slot) => Slot)} add
 * @property {() => void} commit
 * @property {() => void} abort
 */

/**
 * @param {Map<Slot, number>} specimenToRefCount
 * @param {(specimen: Slot) => boolean} predicate
 * @returns {RefCounter}
 */
export const makeRefCounter = (specimenToRefCount, predicate) => {
  // Track how many times each slot is added within a single message.
  /** @type {Map<Slot, number>} */
  const pendingCounts = new Map();

  return harden({
    /**
     * @param {Slot} specimen
     * @returns {Slot}
     */
    add(specimen) {
      if (predicate(specimen)) {
        const currentCount = pendingCounts.get(specimen) || 0;
        pendingCounts.set(specimen, currentCount + 1);
      }
      return specimen;
    },
    commit() {
      // Increment the reference count for each seen specimen by the number of times it was added.
      for (const [specimen, count] of pendingCounts.entries()) {
        const numRefs = specimenToRefCount.get(specimen) || 0;
        specimenToRefCount.set(specimen, numRefs + count);
      }
      pendingCounts.clear();
    },
    abort() {
      pendingCounts.clear();
    },
  });
};
