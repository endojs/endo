import { Remotable, makeTagged, passableSymbolForName } from '@endo/pass-style';

/**
 * Based on roundTripPairs from './_marshal-test-data.js'
 *
 * A list of `[body, justinSrc]` pairs, where the body parses into
 * an encoding that decodes to a Justin expression that evaluates to something
 * that has the same encoding.
 *
 * @type {([string, string] | [string, string, unknown[]])[]}
 */
export const justinPairs = harden([
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
  [
    '{"@qclass":"symbol","name":"@@asyncIterator"}',
    'passableSymbolForName("@@asyncIterator")',
  ],
  ['{"@qclass":"symbol","name":"@@match"}', 'passableSymbolForName("@@match")'],
  ['{"@qclass":"symbol","name":"foo"}', 'passableSymbolForName("foo")'],
  ['{"@qclass":"symbol","name":"@@@@foo"}', 'passableSymbolForName("@@@@foo")'],

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

  // tagged
  ['{"@qclass":"tagged","tag":"x","payload":8}', 'makeTagged("x",8)'],
  [
    '{"@qclass":"tagged","tag":"x","payload":{"@qclass":"undefined"}}',
    'makeTagged("x",undefined)',
  ],

  // TODO The justinBuilder is not yet able to do slots well.
  // // Slots
  // [
  //   '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0}]',
  //   '[slot(0,"Alleged: for testing Justin")]',
  // ],
  // // More Slots
  // [
  //   '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0},{"@qclass":"slot","iface":"Remotable","index":1}]',
  //   '[slotToVal("hello","Alleged: for testing Justin"),slotToVal(null,"Remotable")]',
  //   ['hello', null],
  // ],
  // // Tests https://github.com/endojs/endo/issues/1185 fix
  // [
  //   '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0},{"@qclass":"slot","index":0}]',
  //   '[slot(0,"Alleged: for testing Justin"),slot(0)]',
  // ],
]);

export const fakeJustinCompartment = () => {
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
