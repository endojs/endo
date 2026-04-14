import fs from 'node:fs';
import {
  makeClient,
  makeInMemoryBaggage,
  makeOcapnTable,
  parseSlot,
  locationToLocationId,
  provideFromBaggage,
} from '@endo/ocapn';

/** @type {WeakMap<object, string>} */
const objectToProcessRefId = new WeakMap();
/** @type {Map<string, object>} */
const processRefIdToObject = new Map();
let nextProcessRefId = 1;
const RAW_MAP = Symbol('rawMap');

/**
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
const isPlainObject = value => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
};

/**
 * Default codec used by filesystem baggage.
 *
 * This supports pass-by-copy data directly. Non-plain objects are tracked as
 * process-local references, which is sufficient for restart-in-process tests.
 * Durable deployments should supply codec hooks for their object model.
 *
 * @param {any} value
 * @returns {any}
 */
const defaultEncodeValue = value => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') {
    return { __endoType: 'bigint', value: `${value}` };
  }
  if (Array.isArray(value)) {
    return value.map(defaultEncodeValue);
  }
  if (value instanceof Map) {
    return {
      __endoType: 'map',
      entries: Array.from(value.entries(), ([key, entryValue]) => [
        defaultEncodeValue(key),
        defaultEncodeValue(entryValue),
      ]),
    };
  }
  if (isPlainObject(value)) {
    return {
      __endoType: 'object',
      entries: Object.entries(value).map(([key, entryValue]) => [
        key,
        defaultEncodeValue(entryValue),
      ]),
    };
  }
  if (typeof value === 'object') {
    let processRefId = objectToProcessRefId.get(value);
    if (!processRefId) {
      processRefId = `${nextProcessRefId}`;
      nextProcessRefId += 1;
      objectToProcessRefId.set(value, processRefId);
      processRefIdToObject.set(processRefId, value);
    }
    return {
      __endoType: 'processRef',
      id: processRefId,
    };
  }
  throw Error(`Unsupported fs-baggage value type: ${typeof value}`);
};

/**
 * @param {any} encoded
 * @returns {any}
 */
const defaultDecodeValue = encoded => {
  if (
    encoded === null ||
    typeof encoded === 'string' ||
    typeof encoded === 'number' ||
    typeof encoded === 'boolean'
  ) {
    return encoded;
  }
  if (Array.isArray(encoded)) {
    return encoded.map(defaultDecodeValue);
  }
  if (isPlainObject(encoded)) {
    const { __endoType } = encoded;
    if (__endoType === 'bigint') {
      return BigInt(encoded.value);
    }
    if (__endoType === 'map') {
      return new Map(
        encoded.entries.map(([key, value]) => [
          defaultDecodeValue(key),
          defaultDecodeValue(value),
        ]),
      );
    }
    if (__endoType === 'object') {
      return Object.fromEntries(
        encoded.entries.map(([key, value]) => [key, defaultDecodeValue(value)]),
      );
    }
    if (__endoType === 'processRef') {
      const value = processRefIdToObject.get(encoded.id);
      if (value === undefined) {
        throw Error(`Unknown processRef id in fs baggage: ${encoded.id}`);
      }
      return value;
    }
    return Object.fromEntries(
      Object.entries(encoded).map(([key, value]) => [key, defaultDecodeValue(value)]),
    );
  }
  throw Error('Unsupported encoded fs-baggage value');
};

/**
 * @returns {any}
 */
export const makeInMemoryDurableBaggage = () => {
  return makeInMemoryBaggage();
};

/**
 * @param {object} options
 * @param {string} options.filePath
 * @param {(value: any) => any} [options.encodeValue]
 * @param {(value: any) => any} [options.decodeValue]
 * @returns {any}
 */
export const makeFsDurableBaggage = ({
  filePath,
  encodeValue = defaultEncodeValue,
  decodeValue = defaultDecodeValue,
}) => {
  /** @type {() => void} */
  let persist = () => {};

  /**
   * @param {any} value
   * @returns {any}
   */
  const makePersistentValue = value => {
    if (!(value instanceof Map)) {
      return value;
    }
    return new Map(
      Array.from(value.entries(), ([entryKey, entryValue]) => [
        entryKey,
        makePersistentValue(entryValue),
      ]),
    );
  };

  /** @type {Map<string, any>} */
  const entries = new Map();
  if (fs.existsSync(filePath)) {
    const json = fs.readFileSync(filePath, 'utf8');
    if (json.trim()) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed.entries)) {
        for (const [key, encoded] of parsed.entries) {
          entries.set(key, makePersistentValue(decodeValue(encoded)));
        }
      }
    }
  }

  persist = () => {
    const serialized = {
      entries: Array.from(entries.entries(), ([key, value]) => [
        key,
        encodeValue(value),
      ]),
    };
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
  };

  /** @type {WeakMap<Map<any, any>, any>} */
  const mapWrappers = new WeakMap();

  /**
   * @param {any} value
   * @returns {any}
   */
  const unwrapMapLike = value => {
    if (value && typeof value === 'object' && value[RAW_MAP] instanceof Map) {
      return value[RAW_MAP];
    }
    return value;
  };

  const wrapIfMap = value => {
    if (!(value instanceof Map)) {
      return value;
    }
    const existingWrapper = mapWrappers.get(value);
    if (existingWrapper) {
      return existingWrapper;
    }
    const wrapped = Object.freeze({
      [RAW_MAP]: value,
      has: key => value.has(key),
      get: key => wrapIfMap(value.get(key)),
      set: (key, entryValue) => {
        value.set(key, makePersistentValue(unwrapMapLike(entryValue)));
        persist();
        return wrapped;
      },
      delete: key => {
        const didDelete = value.delete(key);
        if (didDelete) {
          persist();
        }
        return didDelete;
      },
      clear: () => {
        if (value.size > 0) {
          value.clear();
          persist();
        }
      },
      entries: function* entriesIterator() {
        for (const [key, entryValue] of value.entries()) {
          yield [key, wrapIfMap(entryValue)];
        }
      },
      keys: () => value.keys(),
      values: function* valuesIterator() {
        for (const entryValue of value.values()) {
          yield wrapIfMap(entryValue);
        }
      },
      forEach: (fn, thisArg) => {
        value.forEach((entryValue, key) => {
          fn.call(thisArg, wrapIfMap(entryValue), key, wrapped);
        });
      },
      get size() {
        return value.size;
      },
      [Symbol.iterator]: function* mapIterator() {
        yield* wrapped.entries();
      },
    });
    mapWrappers.set(value, wrapped);
    return wrapped;
  };

  return Object.freeze({
    has: key => entries.has(key),
    get: key => wrapIfMap(entries.get(key)),
    init: (key, value) => {
      if (entries.has(key)) {
        throw Error(`Baggage key already initialized: ${key}`);
      }
      entries.set(key, makePersistentValue(value));
      persist();
    },
    set: (key, value) => {
      entries.set(key, makePersistentValue(value));
      persist();
    },
  });
};

/**
 * @param {any} baggage
 * @returns {Map<string, { localSlots: Map<string, any>, nextExportPosition: bigint }>}
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
        nextExportPosition: 1n,
      };
      tableRegistry.set(tableKey, tableState);
    }
    const persistTableState = () => {
      tableRegistry.set(tableKey, tableState);
    };

    for (const [slot, value] of tableState.localSlots.entries()) {
      table.registerSlot(slot, value);
    }

    const registerSlot = (slot, value) => {
      table.registerSlot(slot, value);
      const { type, isLocal, position } = parseSlot(slot);
      if (isLocal && position > 0n && (type === 'o' || type === 'p')) {
        tableState.localSlots.set(slot, value);
        if (position >= tableState.nextExportPosition) {
          tableState.nextExportPosition = position + 1n;
        }
        persistTableState();
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
        persistTableState();
      }
    };

    return Object.freeze({
      ...table,
      registerSlot,
      dropSlot,
      getNextExportPosition: () => tableState.nextExportPosition,
      setNextExportPosition: nextExportPosition => {
        if (
          typeof nextExportPosition === 'bigint' &&
          nextExportPosition >= 1n
        ) {
          tableState.nextExportPosition = nextExportPosition;
          persistTableState();
        }
      },
    });
  };
};

/**
 * @param {object} [options]
 * @param {any} [options.baggage]
 * @param {(options: object) => any} [options.makeOcapnTableFactory]
 * @param {boolean} [options.tryResumeSession]
 * @returns {any}
 */
export const makeDurableClient = ({
  baggage,
  makeOcapnTableFactory,
  ...rest
} = {}) => {
  if (rest.tryResumeSession && baggage === undefined) {
    throw Error(
      'makeDurableClient requires explicit baggage when tryResumeSession is enabled',
    );
  }
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
