import {
  makeClient,
  makeInMemoryBaggage,
  makeOcapnTable,
  parseSlot,
  locationToLocationId,
  provideFromBaggage,
} from '@endo/ocapn';

/**
 * @returns {any}
 */
export const makeInMemoryDurableBaggage = () => {
  return makeInMemoryBaggage();
};

/**
 * @param {any} baggage
 * @returns {Map<string, { localSlots: Map<string, any> }>}
 */
const provideDurableTableRegistry = baggage => {
  return provideFromBaggage(baggage, 'ocapn-durable:tables', () => new Map());
};

/**
 * @param {object} options
 * @param {any} options.baggage
 * @param {(options: object) => any} [options.makeBaseOcapnTable]
 * @returns {(options: object) => any}
 */
export const makeDurableOcapnTableFactory = ({
  baggage,
  makeBaseOcapnTable = makeOcapnTable,
}) => {
  const tableRegistry = provideDurableTableRegistry(baggage);

  return options => {
    const table = makeBaseOcapnTable(options);
    const { peerLocation } = options;
    if (!peerLocation) {
      return table;
    }

    const tableKey = locationToLocationId(peerLocation);
    let tableState = tableRegistry.get(tableKey);
    if (!tableState) {
      tableState = {
        localSlots: new Map(),
      };
      tableRegistry.set(tableKey, tableState);
    }

    for (const [slot, value] of tableState.localSlots.entries()) {
      table.registerSlot(slot, value);
    }

    const registerSlot = (slot, value) => {
      table.registerSlot(slot, value);
      const { type, isLocal, position } = parseSlot(slot);
      if (isLocal && position > 0n && (type === 'o' || type === 'p')) {
        tableState.localSlots.set(slot, value);
      }
    };

    const dropSlot = (slot, refcount) => {
      table.dropSlot(slot, refcount);
      const { type, isLocal, position } = parseSlot(slot);
      if (!isLocal || position <= 0n || (type !== 'o' && type !== 'p')) {
        return;
      }
      if (table.getRefCount(slot) === 0) {
        tableState.localSlots.delete(slot);
      }
    };

    return Object.freeze({
      ...table,
      registerSlot,
      dropSlot,
    });
  };
};

/**
 * @param {object} [options]
 * @param {any} [options.baggage]
 * @param {(options: object) => any} [options.makeOcapnTableFactory]
 * @returns {any}
 */
export const makeDurableClient = ({ baggage, makeOcapnTableFactory, ...rest } = {}) => {
  const resolvedBaggage = baggage || makeInMemoryDurableBaggage();
  const durableTableFactory = makeDurableOcapnTableFactory({
    baggage: resolvedBaggage,
    makeBaseOcapnTable: makeOcapnTableFactory,
  });
  return makeClient({
    ...rest,
    baggage: resolvedBaggage,
    makeOcapnTableFactory: durableTableFactory,
  });
};
