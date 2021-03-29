// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { makeMarshal, Remotable } from '../src/marshal';
import { decodeToJustin } from '../src/marshal-justin';

// this only includes the tests that do not use liveSlots

/**
 * Based on roundTripPairs from test-marshal.js
 *
 * A list of `[body, justinSrc]` pairs, where the body parses into
 * an encoding that decodes to a Justin expression that evaluates to something
 * that has the same encoding.
 */
export const jsonPairs = harden([
  // Justin is the same as the JSON encoding but without unnecessary quoting
  ['[1,2]', '[1,2]'],
  ['{"foo":1}', '{foo:1}'],
  ['{"a":1,"b":2}', '{a:1,b:2}'],
  ['{"a":1,"b":{"c":3}}', '{a:1,b:{c:3}}'],
  ['true', 'true'],
  ['1', '1'],
  ['"abc"', '"abc"'],
  ['null', 'null'],

  // Primitives not representable in JSON
  ['{"@qclass":"undefined"}', 'undefined'],
  ['{"@qclass":"NaN"}', 'NaN'],
  ['{"@qclass":"Infinity"}', 'Infinity'],
  ['{"@qclass":"-Infinity"}', '-Infinity'],
  ['{"@qclass":"bigint","digits":"4"}', '4n'],
  ['{"@qclass":"bigint","digits":"9007199254740993"}', '9007199254740993n'],
  ['{"@qclass":"@@asyncIterator"}', 'Symbol.asyncIterator'],

  // Arrays and objects
  ['[{"@qclass":"undefined"}]', '[undefined]'],
  ['{"foo":{"@qclass":"undefined"}}', '{foo:undefined}'],
  ['{"@qclass":"error","message":"","name":"Error"}', 'Error("")'],
  [
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
    'ReferenceError("msg")',
  ],

  // The one case where JSON is not a semantic subset of JS
  ['{"__proto__":8}', '{["__proto__"]:8}'],

  // The Hilbert Hotel is always tricky
  ['{"@qclass":"hilbert","original":8}', '{"@qclass":8}'],
  ['{"@qclass":"hilbert","original":"@qclass"}', '{"@qclass":"@qclass"}'],
  [
    '{"@qclass":"hilbert","original":{"@qclass":"hilbert","original":8}}',
    '{"@qclass":{"@qclass":8}}',
  ],
  [
    '{"@qclass":"hilbert","original":{"@qclass":"hilbert","original":8,"rest":{"foo":"foo1"}},"rest":{"bar":{"@qclass":"hilbert","original":{"@qclass":"undefined"}}}}',
    '{"@qclass":{"@qclass":8,foo:"foo1"},bar:{"@qclass":undefined}}',
  ],

  // ibids and slots
  [
    '[{"foo":8},{"@qclass":"ibid","index":1}]',
    '[initIbid(1,{foo:8}),getIbid(1)]',
  ],
  [
    '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0},{"@qclass":"ibid","index":1}]',
    '[initIbid(1,getSlotVal(0,"Alleged: for testing Justin")),getIbid(1)]',
  ],
]);

const fakeJustinCompartment = () => {
  const getSlotVal = (index, iface) =>
    Remotable(iface, undefined, { getIndex: () => index });
  const ibids = [];
  const initIbid = (index, val) => {
    assert(ibids[index] === undefined);
    ibids[index] = val;
    return val;
  };
  const getIbid = index => ibids[index];
  return new Compartment({ getSlotVal, initIbid, getIbid });
};

test('serialize decodeToJustin eval round trip pairs', t => {
  const { serialize } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
  });
  for (const [body, justinSrc] of jsonPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding);
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
  });
  for (const [body] of jsonPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, true);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = serialize(value);
    t.is(newBody, body);
  }
});
