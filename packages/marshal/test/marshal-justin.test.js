import test from '@endo/ses-ava/prepare-endo.js';

import { Remotable, makeTagged } from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';
import { decodeToJustin } from '../src/marshal-justin.js';
import { jsonJustinPairs } from './marshal-test-data.js';

// this only includes the tests that do not use liveSlots

const fakeJustinCompartment = () => {
  const slots = [];
  const slotVals = new Map();
  const populateSlot = (index, iface) => {
    assert.typeof(iface, 'string'); // Assumes not optional the first time
    const r = Remotable(iface, undefined, { getIndex: () => index });
    const s = `s${index}`;
    slotVals.set(s, r);
    slots[index] = s;
    return r;
  };
  const slot = (index, iface = undefined) => {
    if (slots[index] !== undefined) {
      assert(iface === undefined); // Assumes backrefs omit iface
      return slotVals.get(slots[index]);
    }
    return populateSlot(index, iface);
  };
  const slotToVal = (s, iface = undefined) => {
    if (slotVals.has(s)) {
      assert(iface === undefined); // Assumes backrefs omit iface
      return slotVals.get(s);
    }
    return populateSlot(slots.length, iface);
  };
  return new Compartment({ slot, slotToVal, makeTagged });
};

test('serialize decodeToJustin eval round trip pairs', t => {
  const { serialize } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO make Justin work with smallcaps
    serializeBodyFormat: 'capdata',
  });
  for (const [body, justinSrc, slots] of jsonJustinPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, false, slots);
    t.is(justinExpr, justinSrc);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = serialize(value);
    t.is(newBody, body);
  }
});

// Like "serialize decodeToJustin eval round trip pairs" but uses the indented
// representation *without* checking its specific whitespace decisions.
// Just checks that it has equivalent evaluation, and
// that the decoder passes the extra `level` balancing diagnostic in
// `makeYesIndenter`.
test('serialize decodeToJustin indented eval round trip', t => {
  const { serialize } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO make Justin work with smallcaps
    serializeBodyFormat: 'capdata',
  });
  for (const [body, _, slots] of jsonJustinPairs) {
    const c = fakeJustinCompartment();
    t.log(body);
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, true, slots);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = serialize(value);
    t.is(newBody, body);
  }
});
