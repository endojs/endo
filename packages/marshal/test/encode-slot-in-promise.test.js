import test from '@endo/ses-ava/prepare-endo.js';

import { passStyleOf } from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';

const { getOwnPropertyDescriptor, defineProperty } = Object;

const { toStringTag } = Symbol;

test('use safe promise loophole', t => {
  const convertSlotToVal = (slot, _iface) => {
    const p = Promise.resolve(`${slot} placeholder`);
    defineProperty(p, toStringTag, {
      value: `Promise ${slot}`,
    });
    harden(p);
    t.is(passStyleOf(p), 'promise');
    return p;
  };

  const PromiseNameRE = /^Promise (.*)$/;

  const convertValToSlot = p => {
    t.is(passStyleOf(p), 'promise');
    const desc = getOwnPropertyDescriptor(p, toStringTag);
    assert(desc !== undefined);
    const name = desc.value;
    t.is(typeof name, 'string');
    const match = PromiseNameRE.exec(name);
    assert(Array.isArray(match));
    return match[1];
  };
  const { toCapData, fromCapData } = makeMarshal(
    convertValToSlot,
    convertSlotToVal,
    {
      serializeBodyFormat: 'smallcaps',
    },
  );

  const markedPromise = convertSlotToVal('I am kref 3');

  const passable1 = harden([{ markedPromise }]);
  const capData1 = toCapData(passable1);
  t.deepEqual(capData1, {
    body: '#[{"markedPromise":"&0"}]',
    slots: ['I am kref 3'],
  });
  const passable2 = fromCapData(capData1);
  t.deepEqual(passable1, passable2);
  const capData2 = toCapData(passable2);
  t.deepEqual(capData1, capData2);
});
