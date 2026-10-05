// #region marshal-table
const makeSlot1 = (val, serial) => {
  const prefix = Promise.resolve(val) === val ? 'promise' : 'object';
  return `${prefix}${serial}`;
};

export const makeTranslationTable = (
  makeSlot = makeSlot1,
  makeVal = x => x,
) => {
  const valToSlot = new Map();
  const slotToVal = new Map();

  const convertValToSlot = val => {
    if (valToSlot.has(val)) return valToSlot.get(val);
    const slot = makeSlot(val, valToSlot.size);
    valToSlot.set(val, slot);
    slotToVal.set(slot, val);
    return slot;
  };

  const convertSlotToVal = (slot, iface) => {
    if (slotToVal.has(slot)) return slotToVal.get(slot);
    if (makeVal) {
      const val = makeVal(slot, iface);
      valToSlot.set(val, slot);
      slotToVal.set(slot, val);
      return val;
    }
    throw Error(`no such ${iface}: ${slot}`);
  };

  return harden({ convertValToSlot, convertSlotToVal });
};
// #endregion marshal-table
