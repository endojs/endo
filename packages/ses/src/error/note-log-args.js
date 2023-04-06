/* eslint-disable @endo/no-polymorphic-call */
/* eslint-disable no-restricted-globals */

import './internal-types.js';

const { freeze } = Object;
const { isSafeInteger } = Number;

/**
 * @typedef {object} DoublyLinkedCell
 * A cell of a doubly-linked ring, i.e., a doubly-linked circular list.
 * DoublyLinkedCells are not frozen, and so should be closely encapsulated by
 * any abstraction that uses them.
 * @property {DoublyLinkedCell} next
 * @property {DoublyLinkedCell} prev
 * @property {object} key
 * @property {any} value;
 */

/**
 * Makes a new self-linked cell. There are two reasons to do so:
 *    * To make the head sigil of a new initially-empty doubly-linked ring.
 *    * To make a non-sigil cell to be `spliceAfter`ed.
 *
 * @param {object} key
 * @param {any} value
 * @returns {DoublyLinkedCell}
 */
const makeSelfCell = (key, value) => {
  /** @type {Partial<DoublyLinkedCell>} */
  const incompleteCell = {
    next: undefined,
    prev: undefined,
    key,
    value,
  };
  incompleteCell.next = incompleteCell;
  incompleteCell.prev = incompleteCell;
  const selfCell = /** @type {DoublyLinkedCell} */ (incompleteCell);
  // Not frozen!
  return selfCell;
};

/**
 * Splices a self-linked non-sigil cell into a ring after `prev`.
 * `prev` could be the head sigil, or it could be some other non-sigil
 * cell within a ring.
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
 * Must be a non-sigil part of a ring, and therefore non-self-linked
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
 * @param {number} keysBudget
 * @returns {WeakMap<object,any>}
 */
export const makeLRUCacheMap = keysBudget => {
  if (!isSafeInteger(keysBudget) || keysBudget < 0) {
    throw new TypeError(
      'keysBudget must be a safe non-negative integer number',
    );
  }
  /** @type {Map<object, DoublyLinkedCell>} */
  const map = new Map();
  let size = 0; // `size` must remain <= `keysBudget`
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

  // TODO Change to the following line, once our tools don't choke on `?.`.
  // See https://github.com/endojs/endo/issues/1514
  // const get = key => touchCell(key)?.value;
  const get = key => {
    const cell = touchCell(key);
    return cell && cell.value;
  };
  freeze(get);

  const set = (key, value) => {
    if (keysBudget >= 1) {
      let cell = touchCell(key);
      if (cell !== undefined) {
        cell.value = value;
      } else {
        if (size >= keysBudget) {
          const condemned = head.prev;
          spliceOut(condemned); // Drop least recently used
          map.delete(condemned.key);
          size -= 1;
        }
        size += 1;
        cell = makeSelfCell(key, value);
        map.set(key, cell);
        spliceAfter(head, cell); // start most recently used
      }
    }
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
    size -= 1;
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

const defaultLoggedErrorsBudget = 1000;
const defaultArgsPerErrorBudget = 100;

/**
 * @param {number} [errorsBudget]
 * @param {number} [argsPerErrorBudget]
 */
export const makeNoteLogArgsArrayKit = (
  errorsBudget = defaultLoggedErrorsBudget,
  argsPerErrorBudget = defaultArgsPerErrorBudget,
) => {
  if (!isSafeInteger(argsPerErrorBudget) || argsPerErrorBudget < 1) {
    throw new TypeError(
      'argsPerErrorBudget must be a safe positive integer number',
    );
  }

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
  const noteLogArgsArrayMap = makeLRUCacheMap(errorsBudget);

  /**
   * @param {Error} error
   * @param {LogArgs} logArgs
   */
  const addLogArgs = (error, logArgs) => {
    const logArgsArray = noteLogArgsArrayMap.get(error);
    if (logArgsArray !== undefined) {
      if (logArgsArray.length >= argsPerErrorBudget) {
        logArgsArray.shift();
      }
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
