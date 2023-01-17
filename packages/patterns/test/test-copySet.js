import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { makeTagged } from '@endo/marshal';
import { makeCopySet } from '../src/keys/checkKey.js';
import {
  setIsSuperset,
  setIsDisjoint,
  setUnion,
  setDisjointUnion,
  setIntersection,
  setDisjointSubtract,
} from '../src/keys/merge-set-operators.js';
import { M, matches } from '../src/patterns/patternMatchers.js';

import '../src/types.js';

test('operations on copySets', t => {
  const x = makeCopySet(['b', 'a', 'c']);
  const y = makeCopySet(['a', 'b']);
  const z = makeCopySet(['c', 'b']);
  const yUz = setUnion(y, z);
  t.throws(() => setDisjointUnion(y, z), {
    message: /Sets must not have common elements: "b"/,
  });
  const xMy = setDisjointSubtract(x, y);
  t.throws(() => setDisjointUnion(y, z), {
    message: /Sets must not have common elements: "b"/,
  });
  const cy = setDisjointUnion(xMy, y);
  const yIz = setIntersection(y, z);

  t.false(setIsDisjoint(y, z));
  t.assert(setIsDisjoint(xMy, y));

  t.assert(setIsSuperset(x, y));
  t.assert(matches(x, yUz));
  t.assert(matches(x, M.gt(y)));
  t.assert(matches(x, M.gt(z)));
  t.false(matches(y, M.gte(z)));
  t.false(matches(y, M.lte(z)));

  t.deepEqual(x, makeTagged('copySet', ['c', 'b', 'a']));
  t.deepEqual(x, yUz);
  t.deepEqual(x, cy);
  t.deepEqual(y, makeTagged('copySet', ['b', 'a']));
  t.deepEqual(z, makeTagged('copySet', ['c', 'b']));
  t.deepEqual(xMy, makeTagged('copySet', ['c']));
  t.deepEqual(yIz, makeTagged('copySet', ['b']));
});
