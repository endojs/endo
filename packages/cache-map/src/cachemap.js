// @ts-check
/* global globalThis */
/* eslint-disable @endo/no-polymorphic-call */

// eslint-disable-next-line no-restricted-globals
const { Error, TypeError, WeakMap } = globalThis;
// eslint-disable-next-line no-restricted-globals
const { parse, stringify } = JSON;
// eslint-disable-next-line no-restricted-globals
const { isSafeInteger } = Number;
// eslint-disable-next-line no-restricted-globals
const { freeze } = Object;
// eslint-disable-next-line no-restricted-globals
const { toStringTag: toStringTagSymbol } = Symbol;

// eslint-disable-next-line no-restricted-globals
const UNKNOWN_KEY = Symbol('UNKNOWN_KEY');

/**
 * @template T
 * @typedef {T extends object ? { -readonly [K in keyof T]: T[K] } : never} WritableDeep
 *   Intentionally limited to local needs; refer to
 *   https://github.com/sindresorhus/type-fest if insufficient.
 */

/**
 * @template T
 * @param {T} value
 * @param {<U,>(name: string, value: U) => U} [reviver]
 * @returns {WritableDeep<T>}
 */
const deepCopyJsonable = (value, reviver) => {
  const encoded = stringify(value);
  const decoded = parse(encoded, reviver);
  return decoded;
};

const freezingReviver = (_name, value) => freeze(value);

/** @type {<T,>(value: T) => T} */
const deepCopyAndFreezeJsonable = value =>
  deepCopyJsonable(value, freezingReviver);

/**
 * A cache of bounded size, implementing the WeakMap interface but holding keys
 * strongly if created with a non-weak `makeMap` option of
 * {@link makeCacheMapKit}.
 *
 * @template K
 * @template V
 * @typedef {Pick<Map<K, V>, Exclude<keyof WeakMap<WeakKey, *>, 'set'>> & {set: (key: K, value: V) => WeakMapAPI<K, V>}} WeakMapAPI
 */

/**
 * @template K
 * @template V
 * @typedef {WeakMapAPI<K, V> & ({clear?: undefined} | Pick<Map<K, V>, 'clear'>)} SingleEntryMap
 */

/**
 * A cell of a doubly-linked ring (circular list) for a cache map.
 * Instances are not frozen, and so should be closely encapsulated.
 *
 * @template K
 * @template V
 * @typedef {object} CacheMapCell
 * @property {number} id for debugging
 * @property {CacheMapCell<K, V>} next
 * @property {CacheMapCell<K, V>} prev
 * @property {SingleEntryMap<K, V>} data
 */

/**
 * @template K
 * @template V
 * @param {CacheMapCell<K, V>} prev
 * @param {number} id
 * @param {SingleEntryMap<K, V>} data
 * @returns {CacheMapCell<K, V>}
 */
const appendNewCell = (prev, id, data) => {
  const next = prev?.next;
  const cell = { id, next, prev, data };
  prev.next = cell;
  next.prev = cell;
  return cell;
};

/**
 * @template K
 * @template V
 * @param {CacheMapCell<K, V>} cell
 * @param {CacheMapCell<K, V>} prev
 * @param {CacheMapCell<K, V>} [next]
 */
const moveCellAfter = (cell, prev, next = prev.next) => {
  if (cell === prev || cell === next) return; // already in position

  // Splice out cell.
  const { prev: oldPrev, next: oldNext } = cell;
  oldPrev.next = oldNext;
  oldNext.prev = oldPrev;

  // Splice in cell after prev.
  cell.prev = prev;
  cell.next = next;
  prev.next = cell;
  next.prev = cell;
};

/**
 * Clear out a cell to prepare it for future use. Its map is preserved when
 * possible, but must instead be replaced if the associated key is not known.
 *
 * @template K
 * @template V
 * @param {CacheMapCell<K, V>} cell
 * @param {K | UNKNOWN_KEY} oldKey
 * @param {() => SingleEntryMap<K, V>} [makeMap] required when the key is unknown
 */
const resetCell = (cell, oldKey, makeMap) => {
  if (oldKey !== UNKNOWN_KEY) {
    cell.data.delete(oldKey);
    return;
  }
  if (cell.data.clear) {
    cell.data.clear();
    return;
  }
  // WeakMap instances must be replaced when the key is unknown.
  if (!makeMap) {
    throw Error('internal: makeMap is required with UNKNOWN_KEY');
  }
  cell.data = makeMap();
};

const zeroMetrics = freeze({
  totalQueryCount: 0,
  totalHitCount: 0,
  // TODO?
  // * method-specific counts
  // * liveTouchStats/evictedTouchStats { count, sum, mean, min, max }
  //   * p50/p90/p95/p99 via Ben-Haim/Tom-Tov streaming histograms
});
/** @typedef {typeof zeroMetrics} CacheMapMetrics */

/**
 * @template {MapConstructor | WeakMapConstructor} [C=WeakMapConstructor]
 * @template {Parameters<InstanceType<C>['set']>[0]} [K=Parameters<InstanceType<C>['set']>[0]]
 * @template {unknown} [V=unknown]
 * @typedef {object} CacheMapKit
 * @property {WeakMapAPI<K, V>} cache
 * @property {() => CacheMapMetrics} getMetrics
 */

/**
 * Create a bounded-size cache having WeakMap-compatible
 * `has`/`get`/`set`/`delete` methods, capable of supporting SES (specifically
 * `assert` error notes).
 * Key validity, comparison, and referential strength are controlled by the
 * `makeMap` option, which defaults to `WeakMap` but can be set to any producer
 * of objects with those methods (e.g., using `Map` allows for arbitrary keys
 * which will be strongly held).
 * Cache eviction policy is not currently configurable, but strives for a hit
 * ratio at least as good as
 * [LRU](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU) (e.g., it
 * might be
 * [CLOCK](https://en.wikipedia.org/wiki/Page_replacement_algorithm#Clock)
 * or [SIEVE](https://sievecache.com/)).
 *
 * @template {MapConstructor | WeakMapConstructor} [C=WeakMapConstructor]
 * @template {Parameters<InstanceType<C>['set']>[0]} [K=Parameters<InstanceType<C>['set']>[0]]
 * @template {unknown} [V=unknown]
 * @param {number} capacity
 * @param {object} [options]
 * @param {C | (() => SingleEntryMap<K, V>)} [options.makeMap]
 * @returns {CacheMapKit<C, K, V>}
 */
export const makeCacheMapKit = (capacity, options = {}) => {
  if (!isSafeInteger(capacity) || capacity < 0) {
    throw TypeError(
      'capacity must be a non-negative safe integer number <= 2**53 - 1',
    );
  }

  /**
   * @template V
   * @type {<V,>() => SingleEntryMap<K, V>}
   */
  const makeMap = (MaybeCtor => {
    try {
      // @ts-expect-error
      MaybeCtor();
      return /** @type {any} */ (MaybeCtor);
    } catch (err) {
      // @ts-expect-error
      const constructNewMap = () => new MaybeCtor();
      return constructNewMap;
    }
  })(options.makeMap ?? WeakMap);
  const tag =
    /** @type {any} */ (makeMap()).clear === undefined
      ? 'WeakCacheMap'
      : 'CacheMap';

  /** @type {WeakMapAPI<K, CacheMapCell<K, V>>} */
  const keyToCell = makeMap();
  // @ts-expect-error this sentinel head is special
  const head = /** @type {CacheMapCell<K, V>} */ ({
    id: 0,
    // next and prev are established below as self-referential.
    next: undefined,
    prev: undefined,
    data: {
      has: () => {
        throw Error('internal: sentinel head cell has no data');
      },
    },
  });
  head.next = head;
  head.prev = head;
  let cellCount = 0;

  const metrics = deepCopyJsonable(zeroMetrics);
  const getMetrics = () => deepCopyAndFreezeJsonable(metrics);

  /**
   * Touching moves a cell to first position so LRU eviction can target the last
   * cell (`head.prev`).
   *
   * @type {(key: K) => (CacheMapCell<K, V> | undefined)}
   */
  const touchKey = key => {
    metrics.totalQueryCount += 1;
    const cell = keyToCell.get(key);
    if (!cell?.data.has(key)) return undefined;

    metrics.totalHitCount += 1;
    moveCellAfter(cell, head);
    return cell;
  };

  /** @type {WeakMapAPI<K, V>['has']} */
  const has = key => {
    const cell = touchKey(key);
    return cell !== undefined;
  };
  freeze(has);

  /** @type {WeakMapAPI<K, V>['get']} */
  const get = key => {
    const cell = touchKey(key);
    return cell?.data.get(key);
  };
  freeze(get);

  /** @type {WeakMapAPI<K, V>['set']} */
  const set = (key, value) => {
    let cell = touchKey(key);
    if (cell) {
      cell.data.set(key, value);
      // eslint-disable-next-line no-use-before-define
      return implementation;
    }

    if (cellCount < capacity) {
      // Add and use a new cell at first position.
      cell = appendNewCell(head, cellCount + 1, makeMap());
      cellCount += 1; // intentionally follows cell creation
      cell.data.set(key, value);
    } else if (capacity > 0) {
      // Reuse the current tail, moving it to first position.
      cell = head.prev;
      resetCell(/** @type {any} */ (cell), UNKNOWN_KEY, makeMap);
      cell.data.set(key, value);
      moveCellAfter(cell, head);
    }

    // Don't establish this entry until prior steps succeed.
    if (cell) keyToCell.set(key, cell);

    // eslint-disable-next-line no-use-before-define
    return implementation;
  };
  freeze(set);

  // "delete" is a keyword.
  const { delete: deleteEntry } = {
    /** @type {WeakMapAPI<K, V>['delete']} */
    delete: key => {
      const cell = keyToCell.get(key);
      if (!cell?.data.has(key)) {
        keyToCell.delete(key);
        return false;
      }
      moveCellAfter(cell, head.prev);
      resetCell(cell, key);
      keyToCell.delete(key);
      return true;
    },
  };
  freeze(deleteEntry);

  const implementation = /** @type {WeakMapAPI<K, V>} */ ({
    has,
    get,
    set,
    delete: deleteEntry,
    // eslint-disable-next-line jsdoc/check-types
    [/** @type {typeof Symbol.toStringTag} */ (toStringTagSymbol)]: tag,
  });
  freeze(implementation);

  const kit = { cache: implementation, getMetrics };
  return freeze(kit);
};
freeze(makeCacheMapKit);
