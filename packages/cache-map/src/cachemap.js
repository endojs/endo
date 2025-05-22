// @ts-check
/* global globalThis */
/* eslint-disable @endo/no-polymorphic-call */

// eslint-disable-next-line no-restricted-globals
const { Error, TypeError, WeakMap } = globalThis;
// eslint-disable-next-line no-restricted-globals
const { isSafeInteger } = Number;
// eslint-disable-next-line no-restricted-globals
const { freeze } = Object;
// eslint-disable-next-line no-restricted-globals
const { toStringTag: toStringTagSymbol } = Symbol;

// eslint-disable-next-line no-restricted-globals
const UNKNOWN_KEY = Symbol('UNKNOWN_KEY');

/**
 * @template {WeakKey} K
 * @template V
 * @typedef {WeakMap<K, V>} SingleEntryMap
 */

/**
 * A cell of a doubly-linked ring (circular list) for a cache map.
 * Instances are not frozen, and so should be closely encapsulated.
 *
 * @template {WeakKey} K
 * @template V
 * @typedef {object} CacheMapCell
 * @property {number} id for debugging
 * @property {CacheMapCell<K, V>} next
 * @property {CacheMapCell<K, V>} prev
 * @property {SingleEntryMap<K, V>} data
 */

/**
 * @template {WeakKey} K
 * @template V
 * @param {CacheMapCell<K, V>} prev
 * @param {number} id
 * @param {WeakMap<K, V>} data
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
 * @template {WeakKey} K
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
 * @template {WeakKey} K
 * @template V
 * @param {CacheMapCell<K, V>} cell
 * @param {K | UNKNOWN_KEY} oldKey
 * @param {() => WeakMap<K, V>} [makeMap] required when the key is unknown
 */
const resetCell = (cell, oldKey, makeMap) => {
  if (oldKey === UNKNOWN_KEY) {
    if (!makeMap) throw Error('internal: makeMap is required with UNKNOWN_KEY');
    cell.data = makeMap();
  } else {
    cell.data.delete(oldKey);
  }
};

/**
 * Create a bounded-size cache having WeakMap-compatible
 * `has`/`get`/`set`/`delete` methods, capable of supporting SES (specifically
 * `assert` error notes). Key validity, comparison, and referential strength are
 * all identical to WeakMap (e.g., user abandonment of a key used in the cache
 * releases the associated value from the cache for garbage collection).
 * Cache eviction policy is not currently configurable, but strives for a hit
 * ratio at least as good as
 * [LRU](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU) (e.g., it
 * might be
 * [CLOCK](https://en.wikipedia.org/wiki/Page_replacement_algorithm#Clock)
 * or [SIEVE](https://sievecache.com/)).
 *
 * @template {WeakKey} K
 * @template {unknown} V
 * @param {number} capacity
 * @returns {WeakMap<K, V>}
 */
export const makeCacheMap = capacity => {
  if (!isSafeInteger(capacity) || capacity < 0) {
    throw TypeError(
      'capacity must be a non-negative safe integer number <= 2**53 - 1',
    );
  }

  /** @type {<V,>() => WeakMap<K, V>} */
  const makeMap = () => new WeakMap();

  /** @type {WeakMap<K, CacheMapCell<K, V>>} */
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

  /**
   * Touching moves a cell to first position so LRU eviction can target the last
   * cell (`head.prev`).
   *
   * @type {(key: K) => (CacheMapCell<K, V> | undefined)}
   */
  const touchKey = key => {
    const cell = keyToCell.get(key);
    if (!cell?.data.has(key)) return undefined;
    moveCellAfter(cell, head);
    return cell;
  };

  /** @type {(key: K) => boolean} */
  const has = key => {
    const cell = touchKey(key);
    return cell !== undefined;
  };
  freeze(has);

  /** @type {(key: K) => (V | undefined)} */
  const get = key => {
    const cell = touchKey(key);
    return cell?.data.get(key);
  };
  freeze(get);

  /** @type {(key: K, value: V) => WeakMap<K, V>} */
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
      resetCell(cell, UNKNOWN_KEY, makeMap);
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
    /** @type {(key: K) => boolean} */
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

  const implementation = /** @type {WeakMap<K, V>} */ ({
    has,
    get,
    set,
    delete: deleteEntry,
    // eslint-disable-next-line jsdoc/check-types
    [/** @type {typeof Symbol.toStringTag} */ (toStringTagSymbol)]:
      'WeakCacheMap',
  });
  freeze(implementation);
  return implementation;
};
freeze(makeCacheMap);
