// @ts-check
/* eslint-disable @endo/no-polymorphic-call */

// eslint-disable-next-line no-restricted-globals
const { isSafeInteger } = Number;
// eslint-disable-next-line no-restricted-globals
const { freeze } = Object;
// eslint-disable-next-line no-restricted-globals
const { toStringTag: toStringTagSymbol } = Symbol;

/**
 * @template Data
 * @typedef {object} DoublyLinkedCell
 * A cell of a doubly-linked ring, i.e., a doubly-linked circular list.
 * DoublyLinkedCells are not frozen, and so should be closely encapsulated by
 * any abstraction that uses them.
 * @property {DoublyLinkedCell<Data>} next
 * @property {DoublyLinkedCell<Data>} prev
 * @property {Data} data
 */

/**
 * Makes a new self-linked cell. There are two reasons to do so:
 *    * To make the head sigil of a new initially-empty doubly-linked ring.
 *    * To make a non-sigil cell to be `spliceAfter`ed.
 *
 * @template Data
 * @param {Data} data
 * @returns {DoublyLinkedCell<Data>}
 */
const makeSelfCell = data => {
  /** @type {Partial<DoublyLinkedCell<Data>>} */
  const incompleteCell = {
    next: undefined,
    prev: undefined,
    data,
  };
  const selfCell = /** @type {DoublyLinkedCell<Data>} */ (incompleteCell);
  selfCell.next = selfCell;
  selfCell.prev = selfCell;
  // Not frozen!
  return selfCell;
};

/**
 * Splices a self-linked non-sigil cell into a ring after `prev`.
 * `prev` could be the head sigil, or it could be some other non-sigil
 * cell within a ring.
 *
 * @template Data
 * @param {DoublyLinkedCell<Data>} prev
 * @param {DoublyLinkedCell<Data>} selfCell
 */
const spliceAfter = (prev, selfCell) => {
  if (prev === selfCell) {
    // eslint-disable-next-line no-restricted-globals
    throw TypeError('Cannot splice a cell into itself');
  }
  if (selfCell.next !== selfCell || selfCell.prev !== selfCell) {
    // eslint-disable-next-line no-restricted-globals
    throw TypeError('Expected self-linked cell');
  }
  const cell = selfCell;
  // rename variable cause it isn't self-linked after this point.

  const next = prev.next;
  cell.prev = prev;
  cell.next = next;
  prev.next = cell;
  next.prev = cell;
  // Not frozen!
  return cell;
};

/**
 * @template Data
 * @param {DoublyLinkedCell<Data>} cell
 * No-op if the cell is self-linked.
 */
const spliceOut = cell => {
  const { prev, next } = cell;
  prev.next = next;
  next.prev = prev;
  cell.prev = cell;
  cell.next = cell;
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
 * @param {number} keysBudget
 * @returns {WeakMap<K,V>}
 */
export const makeCacheMap = keysBudget => {
  if (!isSafeInteger(keysBudget) || keysBudget < 0) {
    // eslint-disable-next-line no-restricted-globals
    throw TypeError('keysBudget must be a safe non-negative integer number');
  }
  /** @typedef {DoublyLinkedCell<WeakMap<K, V> | undefined>} CacheMapCell */
  /** @type {WeakMap<K, CacheMapCell>} */
  // eslint-disable-next-line no-restricted-globals
  const keyToCell = new WeakMap();
  let size = 0; // `size` must remain <= `keysBudget`
  // As a sigil, `head` uniquely is not in the `keyToCell` map.
  /** @type {CacheMapCell} */
  const head = makeSelfCell(undefined);

  const touchCell = key => {
    const cell = keyToCell.get(key);
    if (cell === undefined || cell.data === undefined) {
      // Either the key was GCed, or the cell was condemned.
      return undefined;
    }
    // Becomes most recently used
    spliceOut(cell);
    spliceAfter(head, cell);
    return cell;
  };

  /**
   * @param {K} key
   */
  const has = key => touchCell(key) !== undefined;
  freeze(has);

  /**
   * @param {K} key
   */
  // UNTIL https://github.com/endojs/endo/issues/1514
  // Prefer: const get = key => touchCell(key)?.data?.get(key);
  const get = key => {
    const cell = touchCell(key);
    return cell && cell.data && cell.data.get(key);
  };
  freeze(get);

  /**
   * @param {K} key
   * @param {V} value
   */
  const set = (key, value) => {
    if (keysBudget < 1) {
      // eslint-disable-next-line no-use-before-define
      return implementation;
    }

    let cell = touchCell(key);
    if (cell === undefined) {
      cell = makeSelfCell(undefined);
      spliceAfter(head, cell); // start most recently used
    }
    if (!cell.data) {
      // Either a fresh cell or a reused condemned cell.
      size += 1;
      // Add its data.
      // eslint-disable-next-line no-restricted-globals
      cell.data = new WeakMap();
      // Advertise the cell for this key.
      keyToCell.set(key, cell);
      while (size > keysBudget) {
        const condemned = head.prev;
        spliceOut(condemned); // Drop least recently used
        condemned.data = undefined;
        size -= 1;
      }
    }

    // Update the data.
    cell.data.set(key, value);

    // eslint-disable-next-line no-use-before-define
    return implementation;
  };
  freeze(set);

  // "delete" is a keyword.
  /**
   * @param {K} key
   */
  const deleteIt = key => {
    const cell = keyToCell.get(key);
    if (cell === undefined) {
      return false;
    }
    spliceOut(cell);
    keyToCell.delete(key);
    if (cell.data === undefined) {
      // Already condemned.
      return false;
    }

    cell.data = undefined;
    size -= 1;
    return true;
  };
  freeze(deleteIt);

  const implementation = freeze({
    has,
    get,
    set,
    delete: deleteIt,
    // eslint-disable-next-line jsdoc/check-types
    [/** @type {typeof Symbol.toStringTag} */ (toStringTagSymbol)]:
      'WeakCacheMap',
  });
  return implementation;
};
freeze(makeCacheMap);
