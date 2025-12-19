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
  /** @type {Set<Slot>} */
  const seen = new Set();

  return harden({
    /**
     * @param {Slot} specimen
     * @returns {Slot}
     */
    add(specimen) {
      if (predicate(specimen)) {
        seen.add(specimen);
      }
      return specimen;
    },
    commit() {
      // Increment the reference count for each seen specimen.
      for (const specimen of seen.keys()) {
        const numRefs = specimenToRefCount.get(specimen) || 0;
        specimenToRefCount.set(specimen, numRefs + 1);
      }
      seen.clear();
    },
    abort() {
      seen.clear();
    },
  });
};
