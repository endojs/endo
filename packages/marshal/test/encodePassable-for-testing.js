/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
import { Fail, q } from '@endo/errors';

import {
  makeEncodePassable,
  makeDecodePassable,
} from '../src/encodePassable.js';
import { compareRank, makeComparatorKit } from '../src/rankOrder.js';

const buffers = {
  __proto__: null,
  r: [],
  '?': [],
  '!': [],
};
const resetBuffers = () => {
  buffers.r = [];
  buffers['?'] = [];
  buffers['!'] = [];
};
const cursors = {
  __proto__: null,
  r: 0,
  '?': 0,
  '!': 0,
};
const resetCursors = () => {
  cursors.r = 0;
  cursors['?'] = 0;
  cursors['!'] = 0;
};

const encodeThing = (prefix, r) => {
  buffers[prefix].push(r);
  // With this encoding, all things with the same prefix have the same rank
  return prefix;
};

const decodeThing = (prefix, e) => {
  prefix === e ||
    Fail`expected encoding ${q(e)} to simply be the prefix ${q(prefix)}`;
  (cursors[prefix] >= 0 && cursors[prefix] < buffers[prefix].length) ||
    Fail`while decoding ${q(e)}, expected cursors[${q(prefix)}], i.e., ${q(
      cursors[prefix],
    )} <= ${q(buffers[prefix].length)}`;
  const thing = buffers[prefix][cursors[prefix]];
  cursors[prefix] += 1;
  return thing;
};

const encodePassableInternal = makeEncodePassable({
  encodeRemotable: r => encodeThing('r', r),
  encodePromise: p => encodeThing('?', p),
  encodeError: er => encodeThing('!', er),
});

export const encodePassableInternal2 = makeEncodePassable({
  encodeRemotable: r => encodeThing('r', r),
  encodePromise: p => encodeThing('?', p),
  encodeError: er => encodeThing('!', er),
  format: 'compactOrdered',
});

export const encodePassable = passable => {
  resetBuffers();
  return encodePassableInternal(passable);
};

export const encodePassable2 = passable => {
  resetBuffers();
  return encodePassableInternal2(passable);
};
export const decodePassableInternal = makeDecodePassable({
  decodeRemotable: e => decodeThing('r', e),
  decodePromise: e => decodeThing('?', e),
  decodeError: e => decodeThing('!', e),
});

export const decodePassable = encoded => {
  resetCursors();
  return decodePassableInternal(encoded);
};

const compareRemotables = (x, y) =>
  compareRank(encodeThing('r', x), encodeThing('r', y));

export const { comparator: compareFull } = makeComparatorKit(compareRemotables);
