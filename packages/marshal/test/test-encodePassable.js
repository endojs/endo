// @ts-nocheck
/* eslint-disable no-bitwise */

import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order, import/no-extraneous-dependencies
import { fc } from '@fast-check/ava';

import {
  makeEncodePassable,
  makeDecodePassable,
} from '../src/encodePassable.js';
import { compareRank, makeComparatorKit } from '../src/rankOrder.js';
import { sample } from './test-rankOrder.js';

const { details: X } = assert;

const r2e = new Map();
const e2r = [];

const encodeRemotable = r => {
  if (r2e.has(r)) {
    return r2e.get(r);
  }
  const result = `r${e2r.length}`;
  r2e.set(r, result);
  e2r.push(r);
  return result;
};

const decodeRemotable = e => {
  assert(e.startsWith('r'), X`unexpected encoding ${e}`);
  const i = Number(BigInt(e.substring(1)));
  assert(i >= 0 && i < e2r.length);
  return e2r[i];
};

const compareRemotables = (x, y) =>
  compareRank(encodeRemotable(x), encodeRemotable(y));

const encodeKey = makeEncodePassable({ encodeRemotable });

const decodeKey = makeDecodePassable({ decodeRemotable });

const { comparator: compareFull } = makeComparatorKit(compareRemotables);

const asNumber = new Float64Array(1);
const asBits = new BigUint64Array(asNumber.buffer);
const getNaN = (hexEncoding = '0008000000000000') => {
  let bits = BigInt(`0x${hexEncoding}`);
  bits |= 0x7ff0000000000000n;
  if (!(bits & 0x0001111111111111n)) {
    bits |= 0x0008000000000000n;
  }
  asBits[0] = bits;
  return asNumber[0];
};

const NegativeNaN = getNaN('ffffffffffffffff');

/** @type {[Key, string][]} */
const goldenPairs = harden([
  [1, 'fbff0000000000000'],
  [-1, 'f400fffffffffffff'],
  [NaN, 'ffff8000000000000'],
  [NegativeNaN, 'ffff8000000000000'],
  [0, 'f8000000000000000'],
  [Infinity, 'ffff0000000000000'],
  [-Infinity, 'f000fffffffffffff'],
  [-1234567890n, 'n#90:8765432110'],
  [-123456789n, 'n1:876543211'],
  [-1000n, 'n6:9000'],
  [-999n, 'n7:001'],
  [-1n, 'n9:9'],
  [-0n, 'p1:0'],
  [37n, 'p2:37'],
  [123456789n, 'p9:123456789'],
  [1234567890n, 'p~10:1234567890'],
  [934857932847598725662n, 'p~21:934857932847598725662'],
]);

test('golden round trips', t => {
  for (const [k, e] of goldenPairs) {
    t.is(encodeKey(k), e, 'does k encode as expected');
    t.is(decodeKey(e), k, 'does the key round trip through the encoding');
  }
  // Not round trips
  t.is(encodeKey(-0), 'f8000000000000000');
  t.is(decodeKey('f0000000000000000'), NaN);
});

const orderInvariants = (t, x, y) => {
  const rankComp = compareRank(x, y);
  const fullComp = compareFull(x, y);
  if (rankComp !== 0) {
    t.is(rankComp, fullComp);
  }
  if (fullComp === 0) {
    t.is(rankComp, 0);
  } else {
    t.assert(rankComp === 0 || rankComp === fullComp);
  }
};

test('order invariants', t => {
  for (let i = 0; i < sample.length; i += 1) {
    for (let j = i; j < sample.length; j += 1) {
      orderInvariants(t, sample[i], sample[j]);
    }
  }
});

test('BigInt values round-trip', async t => {
  await fc.assert(
    fc.property(fc.bigInt(), n => {
      const rt = decodeKey(encodeKey(n));
      return t.is(rt, n);
    }),
  );
});

test('BigInt encoding comparison corresponds with numeric comparison', async t => {
  await fc.assert(
    fc.property(fc.bigInt(), fc.bigInt(), (a, b) => {
      const ea = encodeKey(a);
      const eb = encodeKey(b);
      return t.is(a < b, ea < eb) && t.is(a > b, ea > eb);
    }),
  );
});
