import { makePairwiseTable, parseSlot } from './pairwise.js';

/**
 * @typedef {import('./types.js').Slot} Slot
 * @typedef {import('./types.js').SlotType} SlotType
 * @typedef {import('./pairwise.js').PairwiseTable} PairwiseTable
 */

/**
 * @typedef {PairwiseTable & {
 *   getLocalAnswerToPosition: (answer: object) => bigint | undefined,
 * }} OcapnTable
 */

/**
 * @param {(value: object, slot: Slot) => void} importHook
 * @param {(value: object, slot: Slot) => void} exportHook
 * @param {(slot: Slot, refcount: number) => void} onSlotCollected
 * @returns {OcapnTable}
 */
export const makeOcapnTable = (importHook, exportHook, onSlotCollected) => {
  const pairwiseEngine = makePairwiseTable(
    importHook,
    exportHook,
    onSlotCollected,
  );

  // Local Answer is special in OCapN. We don't use the normal export/import mechanism.
  // This is because if we export a local answer, it should be re-exported as
  // a promise. We never return a local answer slot for the value, so that it
  // gets re-exported as a promise. We don't need to refcount local answers
  // because they are never exported as an answer. We still use the pairwise
  // table to track resolvers for local answers.
  const positionToLocalAnswer = new Map();
  const localAnswerToPosition = new WeakMap();

  const getLocalAnswerToPosition = answer => {
    return localAnswerToPosition.get(answer);
  };

  const getValueForSlot = slot => {
    const { type, isLocal, position } = parseSlot(slot);
    if (isLocal && type === 'a') {
      return positionToLocalAnswer.get(position);
    }
    return pairwiseEngine.getValueForSlot(slot);
  };

  const registerSlot = (slot, value) => {
    const { type, isLocal, position } = parseSlot(slot);
    if (isLocal && type === 'a') {
      positionToLocalAnswer.set(position, value);
      localAnswerToPosition.set(value, position);
      return;
    }
    pairwiseEngine.registerSlot(slot, value);
  };

  const dropSlot = (slot, refcount) => {
    const { type, isLocal, position } = parseSlot(slot);
    if (isLocal && type === 'a') {
      positionToLocalAnswer.delete(position);
    }
    pairwiseEngine.dropSlot(slot, refcount);
  };

  const destroy = () => {
    pairwiseEngine.destroy();
    positionToLocalAnswer.clear();
  };

  return harden({
    ...pairwiseEngine,
    getValueForSlot,
    registerSlot,
    dropSlot,
    destroy,
    // extra methods
    getLocalAnswerToPosition,
  });
};
