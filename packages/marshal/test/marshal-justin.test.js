import test from '@endo/ses-ava/test.js';

import { makeError, X } from '@endo/errors';
import {
  Far,
  Remotable,
  makeTagged,
  passableSymbolForName,
} from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';
import { decodeToJustin, qp } from '../src/marshal-justin.js';
import { jsonJustinPairs } from '../tools/marshal-test-data.js';

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
  return new Compartment({
    slot,
    slotToVal,
    makeTagged,
    passableSymbolForName,
  });
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
  for (const [body, justinSrc, slots] of jsonJustinPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, true, slots);
    t.log(justinExpr);
    const condensed = justinExpr.replaceAll(
      // Remove whitespace except in quoted strings, and commas after terminal
      // array elements and object members.
      /("(?:[^\\"]|\\.)*")|\s+|,\n\s*([\]}])/gs,
      (_m, quotedStr, closePunc) => quotedStr || closePunc || '',
    );
    t.is(condensed, justinSrc);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = serialize(value);
    t.is(newBody, body);
  }
});

test('qp for quote passable as a quasi-quoted Justin expression', t => {
  const r = Far('r', {});
  const pr = Promise.resolve('fulfillment');
  const e = makeError(X`xxx ${qp([3n, r, r, pr])} yyy ${qp(pr)}`);
  t.log('zz', e, `ww`);
  t.is(
    e.message,
    // In the literal string below, notice that the second call to `qp`
    // starts the slot count over again. Otherwise, `qp` would be a
    // communications channel. Since the rendered string is only for
    // diagnostic value and does not show the slot content anyway,
    // this is ok.
    // TODO maybe better would be to show the slot contents using an outer
    // `bestEffortsStringify` on the slots array. But that would be a
    // terribly confusing mix of notation. We simply can't show them in
    // Justin other than by slots.
    `xxx ${JSON.stringify(`\`[
  3n,
  slotToVal("s0","Alleged: r"),
  slotToVal("s0"),
  slotToVal("s1"),
]\``)} yyy "\`slotToVal(\\"s0\\")\`"`,
  );

  // For the original motivating example, which is also much more realistic,
  // See qp-on-pattern.test.js in @endo/patterns
});
