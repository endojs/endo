import { Fail, q } from '@endo/errors';
import { passStyleOf } from '@endo/pass-style';
import { compareRank } from './rankOrder.js';
import { recordNames, recordValues } from './encodePassable.js';

const { is } = Object;

/**
 * Since we're starting below the level where Checker is defined, try
 * using a Rejector parameter directly.
 *
 * The pleasantness of this exercise shows we should have used Rejector
 * parameters rather than Checker parameters all along. TODO we should seek
 * to migrate existing uses of Checker to Rejector.
 *
 * TODO Also experiment with pleasant error path labeling.
 *
 * @typedef {false |
 *   ((template: TemplateStringsArray, ...subs: any[]) => false)
 * } Rejector
 */

/**
 * Normally, the `check*` function stays encapsulated
 * and only the `is*` and `assert*` functions are exported.
 * Here, we export the `check*` function too, because a caller is interested
 * in distinguishing diagnostic rejection from internal errors.
 *
 * @param {import('@endo/pass-style').Passable} x
 * @param {import('@endo/pass-style').Passable} y
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const checkEqualEnough = (x, y, reject) => {
  if (is(x, y)) {
    return true;
  }
  harden(x);
  harden(y);
  if (compareRank(x, y) !== 0) {
    return reject && reject`Unequal rank: ${x} vs ${y}`;
  }
  const passStyle = passStyleOf(x);
  passStyle === passStyleOf(y) ||
    Fail`internal: Same rank should imply same passStyle: ${q(
      passStyle,
    )} vs ${q(passStyleOf(y))}`;
  switch (passStyle) {
    case 'undefined':
    case 'null': {
      throw Fail`internal: x sameRank y should imply x is y: ${x} vs ${y}`;
    }
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'string':
    case 'symbol':
    case 'remotable': {
      return reject && reject`Unequal: ${x} vs ${y}`;
    }
    case 'promise': {
      // what ya gonna do?
      return true;
    }
    case 'error': {
      // TODO equal enough without comparing .message or other properties?
      return (
        x.name === y.name ||
        (reject && reject`Different error names: ${q(x.name)} vs ${q(y.name)}`)
      );
    }
    case 'copyArray': {
      if (x.length !== y.length) {
        return (
          reject && reject`Different lengths: ${q(x.length)} vs ${q(y.length)}`
        );
      }
      return x.every((xel, i) => checkEqualEnough(xel, y[i], reject));
    }
    case 'copyRecord': {
      const xNames = recordNames(x);
      const yNames = recordNames(y);
      return (
        checkEqualEnough(xNames, yNames, reject) &&
        checkEqualEnough(
          recordValues(x, xNames),
          recordValues(y, xNames),
          reject,
        )
      );
    }
    case 'tagged': {
      return (
        checkEqualEnough(x.tag, y.tag, reject) &&
        checkEqualEnough(x.payload, y.payload, reject)
      );
    }
    default: {
      throw Fail`internal: Unexpected passStyle: ${q(passStyle)}`;
    }
  }
};

/**
 * @param { import('@endo/pass-style').Passable } x
 * @param { import('@endo/pass-style').Passable } y
 * @returns { boolean }
 */
export const equalEnough = (x, y) => checkEqualEnough(x, y, false);
harden(equalEnough);

/**
 * @param { import('@endo/pass-style').Passable } x
 * @param { import('@endo/pass-style').Passable } y
 */
export const assertEqualEnough = (x, y) => {
  checkEqualEnough(x, y, Fail);
};
harden(assertEqualEnough);
