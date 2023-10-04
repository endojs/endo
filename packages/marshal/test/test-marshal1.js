/**
 * @file avoid double-JSON encoding capData
 */

// @ts-check

// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

import { arbPassable } from '@endo/pass-style/tools.js';
import { fc } from '@fast-check/ava';
import { isKey, keyEQ } from '@endo/patterns';

import { Far, passStyleOf } from '@endo/pass-style';
import { makeTranslationTable } from './translationTable.js';
import { makeMarshal } from '../src/marshal.js';
import { JSONToCapData, capDataToJSON } from '../src/capDataJSON.js';

const smallCaps = /** @type {const} */ ({
  serializeBodyFormat: 'smallcaps',
  marshalSaveError: err => err,
});

const makeTestMarshal = () => {
  const synthesizeRemotable = (_slot, iface) =>
    Far(iface.replace(/^Alleged: /, ''), {});
  const makeSlot = (v, serial) => {
    const sty = passStyleOf(v);
    if (sty === 'remotable') return `r${serial}`;
    return `a(n) ${sty}`;
  };
  const tt = makeTranslationTable(makeSlot, synthesizeRemotable);

  const m = makeMarshal(tt.convertValToSlot, tt.convertSlotToVal, smallCaps);
  return m;
};

const suite = [
  { obj: null, json: '{"$body":null,"slots":[]}' },
  { obj: [1, 2, undefined], json: '{"$body":[1,2,"#undefined"],"slots":[]}' },
  { obj: { slots: [] }, json: '{"$body":{"slots":[]},"slots":[]}' },
];
harden(suite);

test('encode example passables in 1 level of JSON', t => {
  const m = makeTestMarshal();

  for (const { obj, json } of suite) {
    t.log(obj);
    const cd = m.toCapData(obj);
    const j = capDataToJSON(cd);
    t.is(j, json);

    const cd2 = JSONToCapData(j);
    t.deepEqual(cd, cd2);
    const v = m.fromCapData(cd);
    keyEQ(obj, v) ? t.pass() : t.deepEqual(obj, v);
  }
});

test('encode arbitrary passable in 1 level of JSON', t => {
  const m = makeTestMarshal();
  fc.assert(
    fc.property(fc.record({ x: arbPassable }), ({ x }) => {
      const { body, slots } = m.toCapData(x);
      //   t.log({ body, slots });
      const j = capDataToJSON({ body, slots });
      const cd = JSONToCapData(j);
      //   t.log({ cd });

      const j2 = capDataToJSON(cd);
      t.is(j, j2);

      const cd2 = JSONToCapData(j2);
      t.deepEqual(cd, cd2);

      if (isKey(x)) {
        const v = m.fromCapData(cd);
        try {
          if (keyEQ(x, v)) {
            t.pass();
          } else {
            // explain what's different
            t.deepEqual(x, v);
          }
        } catch (err) {
          if (err.message.startsWith('Map comparison not yet implemented:')) {
            t.pass();
          } else {
            t.fail(err);
          }
        }
      }
    }),
    { numRuns: 5_000 },
  );
});
