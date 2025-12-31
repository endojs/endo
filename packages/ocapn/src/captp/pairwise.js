import { makeFinalizingMap } from './finalize.js';
import { makeRefCounter } from './refcount.js';

/**
 * @typedef {import('@endo/eventual-send').Settler} Settler
 * @typedef {import('./types.js').Slot} Slot
 * @typedef {import('./types.js').SlotType} SlotType
 * @typedef {import('./finalize.js').FinalizingMap<Slot, object>} ExportTable
 * @typedef {import('./finalize.js').FinalizingMap<Slot, object>} ImportTable
 *
 * @typedef {object} PairwiseTable
 * @property {(value: object) => Slot | undefined} getSlotForValue
 * @property {(slot: Slot) => object | undefined} getValueForSlot
 * @property {(slot: Slot, value: object) => void} registerSlot
 * @property {(slot: Slot, refcount: number) => void} dropSlot
 * @property {(slot: Slot) => number} getRefCount
 * @property {() => void} clearPendingRefCounts
 * @property {() => void} commitSentRefCounts
 * @property {() => void} commitReceivedRefCounts
 * @property {(slot: Slot, settler: Settler) => void} registerSettler
 * @property {(slot: Slot) => Settler} takeSettler
 * @property {(reason?: Error) => void} destroy
 */

/**
 * @param {SlotType} type
 * @param {boolean} isLocal
 * @param {bigint} position
 * @returns {Slot}
 */
export const makeSlot = (type, isLocal, position) => {
  // @ts-expect-error - we're returning a branded type.
  return `${type}${isLocal ? '+' : '-'}${position}`;
};

/**
 * @param {Slot} slot
 * @returns {{ type: SlotType, isLocal: boolean, position: bigint }}
 */
export const parseSlot = slot => {
  const type = slot[0];
  if (type !== 'a' && type !== 'p' && type !== 'o') {
    throw new Error(`Invalid slot type: ${type}`);
  }
  const isLocal = slot[1] === '+';
  const position = BigInt(slot.slice(2));
  return { type, isLocal, position };
};

/**
 * @param {Slot} slot
 * @returns {boolean}
 */
const isSlotLocal = slot => {
  return slot[1] === '+';
};

/**
 * @param {object} options
 * @param {(val: object, slot: Slot) => void} options.importHook
 * @param {(val: object, slot: Slot) => void} options.exportHook
 * @param {(slot: Slot, refcount: number) => void} options.onSlotCollected
 * @param {boolean} [options.enableImportCollection] - If true, imports are tracked with WeakRefs and GC'd when unreachable. Default: true.
 * @returns {PairwiseTable}
 */
export const makePairwiseTable = ({
  importHook,
  exportHook,
  onSlotCollected,
  enableImportCollection = true,
}) => {
  const valueToSlot = new WeakMap();

  /** @type {ExportTable} */
  const exportTable = makeFinalizingMap(undefined, { weakValues: false });
  /** @type {ImportTable} */
  const importTable = makeFinalizingMap(
    slot => {
      // eslint-disable-next-line no-use-before-define
      const refCount = getRefCount(slot);
      // eslint-disable-next-line no-use-before-define
      refCounts.delete(slot);
      onSlotCollected(slot, refCount);
      // eslint-disable-next-line no-use-before-define
      settlers.delete(slot);
    },
    { weakValues: enableImportCollection },
  );

  const settlers = new Map();
  const registerSettler = (slot, settler) => {
    if (isSlotLocal(slot)) {
      throw new Error('Local settlers are not supported');
    }
    settlers.set(slot, settler);
  };
  const takeSettler = slot => {
    const settler = settlers.get(slot);
    if (!settler) {
      throw new Error(`No settler found for slot ${slot}`);
    }
    settlers.delete(slot);
    return settler;
  };

  const refCounts = new Map();

  /**
   * @param {Slot} slot
   * @returns {number}
   */
  const getRefCount = slot => {
    return refCounts.get(slot) || 0;
  };
  // When receiving: track remote imports (slots from the other side)
  const pendingReceivedRefCounts = makeRefCounter(
    refCounts,
    slot => !isSlotLocal(slot),
  );
  // When sending: track local exports (our own objects we're sharing)
  const pendingSentRefCounts = makeRefCounter(refCounts, slot =>
    isSlotLocal(slot),
  );

  const getSlotForValue = value => {
    const slot = valueToSlot.get(value);
    if (slot !== undefined) {
      // Record potential outbound refcount for this slot (we're sending it).
      pendingSentRefCounts.add(slot);
    }
    return slot;
  };
  const getValueForSlot = slot => {
    let value;
    if (isSlotLocal(slot)) {
      value = exportTable.get(slot);
    } else {
      value = importTable.get(slot);
    }
    if (value !== undefined) {
      // Record potential inbound refcount for this slot (we're receiving it).
      pendingReceivedRefCounts.add(slot);
    }
    return value;
  };

  const registerSlot = (slot, value) => {
    if (isSlotLocal(slot)) {
      if (exportTable.has(slot)) {
        throw new Error('Slot already registered as an export');
      }
      exportTable.set(slot, value);
      valueToSlot.set(value, slot);
      exportHook(value, slot);
    } else {
      if (importTable.has(slot)) {
        throw new Error('Slot already registered as an import');
      }
      importTable.set(slot, value);
      valueToSlot.set(value, slot);
      importHook(value, slot);
      // When we register a new import, it's because we're receiving it in a message.
      // Track it for refcounting.
      pendingReceivedRefCounts.add(slot);
    }
  };

  /**
   * @param {Slot} slot
   * @param {number} refcount
   */
  const dropSlot = (slot, refcount) => {
    const currentRefCount = getRefCount(slot);
    if (currentRefCount > refcount) {
      refCounts.set(slot, currentRefCount - refcount);
    } else {
      refCounts.delete(slot);
      let value;
      if (isSlotLocal(slot)) {
        value = exportTable.get(slot);
        exportTable.delete(slot);
        valueToSlot.delete(value);
      } else {
        value = importTable.get(slot);
        importTable.delete(slot);
      }
      // Clear the value-to-slot mapping so a new slot can be assigned on re-export/re-import
      if (value !== undefined) {
        valueToSlot.delete(value);
      }
    }
  };

  const clearPendingRefCounts = () => {
    pendingReceivedRefCounts.abort();
    pendingSentRefCounts.abort();
  };
  const commitSentRefCounts = () => {
    pendingSentRefCounts.commit();
    pendingReceivedRefCounts.abort();
  };
  const commitReceivedRefCounts = () => {
    pendingReceivedRefCounts.commit();
    pendingSentRefCounts.abort();
  };

  /**
   * Reject all pending settlers with the given reason.
   * This is called when the session ends to ensure all pending promises are rejected.
   * @param {Error} reason
   */
  const rejectAllSettlers = reason => {
    for (const settler of settlers.values()) {
      settler.reject(reason);
    }
    settlers.clear();
  };

  const destroy = reason => {
    // Reject all pending settlers before clearing tables
    rejectAllSettlers(reason);
    exportTable.clearWithoutFinalizing();
    importTable.clearWithoutFinalizing();
    refCounts.clear();
    clearPendingRefCounts();
  };

  /** @type {PairwiseTable} */
  return harden({
    registerSettler,
    takeSettler,
    getSlotForValue,
    getValueForSlot,
    registerSlot,
    dropSlot,
    getRefCount,
    clearPendingRefCounts,
    commitSentRefCounts,
    commitReceivedRefCounts,
    destroy,
  });
};
