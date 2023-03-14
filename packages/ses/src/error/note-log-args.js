/* eslint-disable @endo/no-polymorphic-call */
/* eslint-disable no-restricted-globals */

import './internal-types.js';

const { freeze } = Object;
const { isSafeInteger } = Number;

/**
 * @typedef {object} DoublyLinkedCell
 * DoublyLinkedCells are not frozen, and so should be closely encapsulated by
 * any abstraction that uses them.
 * @property {DoublyLinkedCell} next
 * @property {DoublyLinkedCell} prev
 * @property {object} key
 * @property {any} value;
 */

/**
 * Makes a new self-linked cell. There are two reasons to do so:
 *    * To make the head sigil of a new initially-empty list
 *    * To make a non-sigil cell to be `spliceAfter`ed.
 *
 * @param {object} key
 * @param {any} value
 * @returns {DoublyLinkedCell}
 */
const makeSelfCell = (key, value) => {
  /** @type {DoublyLinkedCell} */
  const selfCell = {
    // @ts-expect-error will be fixed before return
    next: undefined,
    // @ts-expect-error will be fixed before return
    prev: undefined,
    key,
    value,
  };
  selfCell.next = selfCell;
  selfCell.prev = selfCell;
  // Not frozen!
  return selfCell;
};

/**
 * Splices a self-linked non-sigil cell into a list after `prev`.
 * `prev` could be the head sigil, or it could be some other non-sigil
 * cell within a list.
 *
 * @param {DoublyLinkedCell} prev
 * @param {DoublyLinkedCell} selfCell
 */
const spliceAfter = (prev, selfCell) => {
  if (prev === selfCell) {
    throw TypeError('Cannot splice a cell into itself');
  }
  if (selfCell.next !== selfCell || selfCell.prev !== selfCell) {
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
 * @param {DoublyLinkedCell} cell
 * Must be a non-sigil part of a list, and therefore non-self-linked
 */
const spliceOut = cell => {
  const { prev, next } = cell;
  if (prev === cell || next === cell) {
    throw TypeError('Expected non-self-linked cell');
  }
  prev.next = next;
  next.prev = prev;
  cell.prev = cell;
  cell.next = cell;
};

/**
 * The LRUCacheMap is used within the implementation of `assert` and so
 * at a layer below SES or harden. Thus, we give it a `WeakMap`-like interface
 * rather than a `WeakMapStore`-like interface. To work before `lockdown`,
 * the implementation must use `freeze` manually, but still exhausively.
 *
 * It does not hold onto anything weakly. The only sense in which it is
 * WeakMap-like is that it does not support enumeration.
 *
 * TODO: Make parameterized `Key` and `Value` template types
 *
 * @param {number} budget
 * @returns {WeakMap<object,any>}
 */
export const makeLRUCacheMap = budget => {
  if (!isSafeInteger(budget) || budget < 0) {
    throw new TypeError('budget must be a safe non-negative integer number');
  }
  /** @type {Map<object, DoublyLinkedCell>} */
  const map = new Map();
  let count = 0; // count must remain <= budget
  // As a sigil, `head` uniquely is not in the `map`.
  const head = makeSelfCell(undefined, undefined);

  const touchCell = key => {
    const cell = map.get(key);
    if (cell === undefined) {
      return undefined;
    }
    // Becomes most recently used
    spliceOut(cell);
    spliceAfter(head, cell);
    return cell;
  };

  const has = key => touchCell(key) !== undefined;
  freeze(has);

  const get = key => touchCell(key)?.value;
  freeze(get);

  const set = (key, value) => {
    let cell = touchCell(key);
    if (cell !== undefined) {
      cell.value = value;
    }
    if (count >= budget) {
      const condemned = head.prev;
      spliceOut(condemned); // Drop least recently used
      map.delete(condemned.key);
      count -= 1;
    }
    count += 1;
    cell = makeSelfCell(key, value);
    map.set(key, cell);
    spliceAfter(head, cell); // start most recently used
    // eslint-disable-next-line no-use-before-define
    return lruCacheMap; // Needed to be WeakMap-like
  };
  freeze(set);

  // "delete" is a keyword.
  const deleteIt = key => {
    const cell = map.get(key);
    if (cell === undefined) {
      return false;
    }
    spliceOut(cell);
    map.delete(key);
    count -= 1;
    return true;
  };
  freeze(deleteIt);

  const lruCacheMap = freeze({
    has,
    get,
    set,
    delete: deleteIt,
  });
  return lruCacheMap;
};
freeze(makeLRUCacheMap);

/**
 * @param {number} [budget]
 */
export const makeNoteLogArgsArrayKit = (budget = 10_000) => {
  /**
   * @type {WeakMap<Error, LogArgs[]>}
   *
   * Maps from an error to an array of log args, where each log args is
   * remembered as an annotation on that error. This can be used, for example,
   * to keep track of additional causes of the error. The elements of any
   * log args may include errors which are associated with further annotations.
   * An augmented console, like the causal console of `console.js`, could
   * then retrieve the graph of such annotations.
   */
  const noteLogArgsArrayMap = makeLRUCacheMap(budget);

  /**
   * @param {Error} error
   * @param {LogArgs} logArgs
   */
  const addLogArgs = (error, logArgs) => {
    const logArgsArray = noteLogArgsArrayMap.get(error);
    if (logArgsArray !== undefined) {
      logArgsArray.push(logArgs);
    } else {
      noteLogArgsArrayMap.set(error, [logArgs]);
    }
  };
  freeze(addLogArgs);

  /**
   * @param {Error} error
   * @returns {LogArgs[]}
   */
  const takeLogArgsArray = error => {
    const result = noteLogArgsArrayMap.get(error);
    noteLogArgsArrayMap.delete(error);
    return result;
  };
  freeze(takeLogArgsArray);

  return freeze({
    addLogArgs,
    takeLogArgsArray,
  });
};
freeze(makeNoteLogArgsArrayKit);
