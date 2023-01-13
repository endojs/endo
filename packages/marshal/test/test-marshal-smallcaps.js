import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { Far, makeTagged, passStyleOf } from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';

import { roundTripPairs } from './test-marshal-capdata.js';

const { freeze, isFrozen, create, prototype: objectPrototype } = Object;

// this only includes the tests that do not use liveSlots

/**
 * @param {import('../src/types.js').MakeMarshalOptions} [opts]
 */
const makeTestMarshal = (opts = { errorTagging: 'off' }) =>
  makeMarshal(undefined, undefined, {
    serializeBodyFormat: 'smallcaps',
    marshalSaveError: _err => {},
    ...opts,
  });

test('smallcaps serialize unserialize round trip half pairs', t => {
  const { serialize, unserialize } = makeTestMarshal();
  for (const [plain, _] of roundTripPairs) {
    const { body } = serialize(plain);
    const decoding = unserialize({ body, slots: [] });
    t.deepEqual(decoding, plain);
    t.assert(isFrozen(decoding));
  }
});

test('smallcaps serialize static data', t => {
  const { serialize } = makeTestMarshal();
  const ser = val => serialize(val);
  t.throws(() => ser([1, 2]), {
    message: /Cannot pass non-frozen objects like/,
  });
  // -0 serialized as 0
  t.deepEqual(ser(0), { body: '#0', slots: [] });
  t.deepEqual(ser(-0), { body: '#0', slots: [] });
  t.deepEqual(ser(-0), ser(0));
  // unregistered symbols
  t.throws(() => ser(Symbol('sym2')), {
    // An anonymous symbol is not Passable
    message: /Only registered symbols or well-known symbols are passable:/,
  });

  const cd = ser(harden([1, 2]));
  t.is(isFrozen(cd), true);
  t.is(isFrozen(cd.slots), true);
});

test('smallcaps unserialize static data', t => {
  const { unserialize } = makeTestMarshal();
  const uns = body => unserialize({ body, slots: [] });

  // should be frozen
  const arr = uns('#[1,2]');
  t.truthy(isFrozen(arr));
  const a = uns('#{"b":{"c":{"d": []}}}');
  t.truthy(isFrozen(a));
  t.truthy(isFrozen(a.b));
  t.truthy(isFrozen(a.b.c));
  t.truthy(isFrozen(a.b.c.d));
});

test('smallcaps serialize errors', t => {
  const { serialize } = makeTestMarshal();
  const ser = val => serialize(val);

  t.deepEqual(ser(harden(Error())), {
    body: '#{"#error":"","name":"Error"}',
    slots: [],
  });

  t.deepEqual(ser(harden(ReferenceError('msg'))), {
    body: '#{"#error":"msg","name":"ReferenceError"}',
    slots: [],
  });

  t.deepEqual(ser(harden(ReferenceError('#msg'))), {
    body: '#{"#error":"!#msg","name":"ReferenceError"}',
    slots: [],
  });

  const myError = harden({
    __proto__: Error.prototype,
    message: 'mine',
  });
  t.deepEqual(ser(myError), {
    body: '#{"#error":"mine","name":"Error"}',
    slots: [],
  });

  // TODO Once https://github.com/Agoric/SES-shim/issues/579 is merged
  // do a golden of the error notes generated by the following

  // Extra properties
  const errExtra = Error('has extra properties');
  // @ts-ignore Check dynamic consequences of type violation
  errExtra.foo = [];
  freeze(errExtra);
  t.assert(isFrozen(errExtra));
  // @ts-ignore Check dynamic consequences of type violation
  t.falsy(isFrozen(errExtra.foo));
  t.deepEqual(ser(errExtra), {
    body: '#{"#error":"has extra properties","name":"Error"}',
    slots: [],
  });
  // @ts-ignore Check dynamic consequences of type violation
  t.falsy(isFrozen(errExtra.foo));

  // Bad prototype and bad "message" property
  const nonErrorProto1 = { __proto__: Error.prototype, name: 'included' };
  const nonError1 = { __proto__: nonErrorProto1, message: [] };
  t.deepEqual(ser(harden(nonError1)), {
    body: '#{"#error":"","name":"included"}',
    slots: [],
  });
});

test('smallcaps unserialize errors', t => {
  const { unserialize } = makeTestMarshal();
  const uns = body => unserialize({ body, slots: [] });

  const em1 = uns('#{"#error":"msg","name":"ReferenceError"}');
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(isFrozen(em1));

  const em2 = uns('#{"#error":"msg2","name":"TypeError"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('#{"#error":"msg3","name":"Unknown"}');
  t.truthy(em3 instanceof Error);
  t.is(em3.message, 'msg3');
});

test('smallcaps mal-formed @qclass', t => {
  const { unserialize } = makeTestMarshal();
  const uns = body => unserialize({ body, slots: [] });
  t.throws(() => uns('#{"#foo": 0}'), {
    message: 'Unrecognized record type "#foo": {"#foo":0}',
  });
});

test('smallcaps records', t => {
  const fauxPresence = harden({});
  const { serialize: ser, unserialize: unser } = makeMarshal(
    _val => 'slot',
    _slot => fauxPresence,
    {
      errorTagging: 'off',
      serializeBodyFormat: 'smallcaps',
    },
  );

  const emptyData = { body: '#{}', slots: [] };

  function build(descriptors) {
    const o = create(objectPrototype, descriptors);
    return harden(o);
  }

  const enumData = { enumerable: true, value: 'data' };
  const enumGetData = { enumerable: true, get: () => 0 };
  const enumGetFunc = { enumerable: true, get: () => () => 0 };
  const enumSet = { enumerable: true, set: () => undefined };
  const nonenumData = { enumerable: false, value: 3 };

  const ERR_NOACCESSORS = { message: /must not be an accessor property:/ };
  const ERR_ONLYENUMERABLE = { message: /must be an enumerable property:/ };
  const ERR_REMOTABLE = { message: /cannot serialize Remotables/ };

  // empty objects

  // rejected because it is not hardened
  t.throws(
    () => ser({}),
    { message: /Cannot pass non-frozen objects/ },
    'non-frozen data cannot be serialized',
  );

  // harden({})
  t.deepEqual(ser(build()), emptyData);

  const stringData = { body: '#{"enumData":"data"}', slots: [] };

  // serialized data should roundtrip properly
  t.deepEqual(unser(ser(harden({}))), {});
  t.deepEqual(unser(ser(harden({ enumData: 'data' }))), { enumData: 'data' });

  // unserialized data can be serialized again
  t.deepEqual(ser(unser(emptyData)), emptyData);
  t.deepEqual(ser(unser(stringData)), stringData);

  // { key: data }
  // all: pass-by-copy without warning
  t.deepEqual(ser(build({ enumData })), {
    body: '#{"enumData":"data"}',
    slots: [],
  });

  // anything with an accessor is rejected
  t.throws(() => ser(build({ enumGetData })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumGetData, enumData })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumSet })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumSet, enumData })), ERR_NOACCESSORS);

  // anything with non-enumerable properties is rejected
  t.throws(() => ser(build({ nonenumData })), ERR_ONLYENUMERABLE);
  t.throws(() => ser(build({ nonenumData, enumData })), ERR_ONLYENUMERABLE);

  // anything with a function-returning getter is treated as remotable
  t.throws(() => ser(build({ enumGetFunc })), ERR_REMOTABLE);
  t.throws(() => ser(build({ enumGetFunc, enumData })), ERR_REMOTABLE);

  const desertTopping = harden({
    '#tag': 'floor wax',
    payload: 'what is it?',
    '#error': 'old joke',
  });
  const body = `#${JSON.stringify(desertTopping)}`;
  t.throws(() => unser({ body, slots: [] }), {
    message: '#tag record unexpected properties: ["#error"]',
  });
});

/**
 * A test case to illustrate each of the encodings
 *  * `!` - escaped string
 *  * `+` - non-negative bigint
 *  * `-` - negative bigint
 *  * `#` - manifest constant
 *  * `%` - symbol
 *  * `$` - remotable
 *  * `&` - promise
 */
test('smallcaps encoding examples', t => {
  const { serialize, unserialize } = makeMarshal(
    val => val,
    slot => slot,
    {
      errorTagging: 'off',
      serializeBodyFormat: 'smallcaps',
    },
  );

  const assertSer = (val, body, slots, message) =>
    t.deepEqual(serialize(val), { body, slots }, message);

  const assertRoundTrip = (val, body, slots, message) => {
    assertSer(val, body, slots, message);
    const val2 = unserialize(harden({ body, slots }));
    assertSer(val2, body, slots, message);
    t.deepEqual(val, val2, message);
  };

  // Numbers
  assertRoundTrip(0, '#0', [], 'zero');
  assertRoundTrip(500n, '#"+500"', [], 'bigint');
  assertRoundTrip(-400n, '#"-400"', [], '-bigint');

  // Constants
  assertRoundTrip(NaN, '#"#NaN"', [], 'NaN');
  assertRoundTrip(Infinity, '#"#Infinity"', [], 'Infinity');
  assertRoundTrip(-Infinity, '#"#-Infinity"', [], '-Infinity');
  assertRoundTrip(undefined, '#"#undefined"', [], 'undefined');

  // Strings
  assertRoundTrip('unescaped', '#"unescaped"', [], 'unescaped');
  assertRoundTrip('#escaped', `#"!#escaped"`, [], 'escaped #');
  assertRoundTrip('+escaped', `#"!+escaped"`, [], 'escaped +');
  assertRoundTrip('-escaped', `#"!-escaped"`, [], 'escaped -');
  assertRoundTrip('%escaped', `#"!%escaped"`, [], 'escaped %');

  // Symbols
  assertRoundTrip(Symbol.iterator, '#"%@@iterator"', [], 'well known symbol');
  assertRoundTrip(Symbol.for('foo'), '#"%foo"', [], 'reg symbol');
  assertRoundTrip(
    Symbol.for('@@foo'),
    '#"%@@@@foo"',
    [],
    'reg symbol that looks well known',
  );

  // Remotables
  const foo = Far('foo', {});
  const bar = Far('bar', {});
  assertRoundTrip(foo, '#"$0.Alleged: foo"', [foo], 'Remotable object');
  assertRoundTrip(
    harden([foo, bar, foo, bar]),
    '#["$0.Alleged: foo","$1.Alleged: bar","$0","$1"]',
    [foo, bar],
    'Only show iface once',
  );

  // Promises
  const p = harden(Promise.resolve(null));
  assertRoundTrip(p, '#"&0"', [p], 'Promise');

  // Arrays
  assertRoundTrip(harden([1, 2n]), '#[1,"+2"]', [], 'array');

  // Records
  assertRoundTrip(
    harden({ foo: 1, bar: 2n }),
    '#{"bar":"+2","foo":1}',
    [],
    'record',
  );

  // Tagged
  const taggedFoo = makeTagged('foo', 'bar');
  assertRoundTrip(taggedFoo, '#{"#tag":"foo","payload":"bar"}', [], 'tagged');
  const taggedBangFoo = makeTagged('!foo', '!bar');
  assertRoundTrip(
    taggedBangFoo,
    '#{"#tag":"!!foo","payload":"!!bar"}',
    [],
    'tagged',
  );

  // Error
  const err1 = harden(URIError('bad uri'));
  assertRoundTrip(err1, '#{"#error":"bad uri","name":"URIError"}', [], 'error');
  const err2 = harden(Error('#NaN'));
  assertRoundTrip(err2, '#{"#error":"!#NaN","name":"Error"}', [], 'error');

  // non-passable errors alone still serialize
  const nonPassableErr = Error('foo');
  // @ts-expect-error this type error is what we're testing
  nonPassableErr.extraProperty = 'something bad';
  harden(nonPassableErr);
  t.throws(() => passStyleOf(nonPassableErr), {
    message:
      'Passed Error has extra unpassed properties {"extraProperty":{"value":"something bad","writable":false,"enumerable":true,"configurable":false}}',
  });
  assertSer(
    nonPassableErr,
    '#{"#error":"foo","name":"Error"}',
    [],
    'non passable errors pass',
  );
  // pseudo-errors
  const pseudoErr1 = harden({
    __proto__: Error.prototype,
    message: '$not real',
    name: 'URIError',
  });
  assertSer(
    pseudoErr1,
    '#{"#error":"!$not real","name":"URIError"}',
    [],
    'pseudo error',
  );
  const pseudoErr2 = harden({
    __proto__: Error.prototype,
    message: '$not real',
    name: '#MyError',
  });
  assertSer(
    pseudoErr2,
    '#{"#error":"!$not real","name":"!#MyError"}',
    [],
    'pseudo error',
  );

  // Hilbert record
  assertRoundTrip(
    harden({
      '#tag': 'what',
      '#error': 'me',
      '#huh': 'worry',
      '': 'empty',
      '%sym': 'not a symbol',
    }),
    '#{"":"empty","!#error":"me","!#huh":"worry","!#tag":"what","!%sym":"not a symbol"}',
    [],
    'hilbert property names',
  );
});

test('smallcaps proto problems', t => {
  const exampleAlice = Far('Alice', {});
  const { serialize: toSmallcaps, unserialize: fromSmallcaps } = makeMarshal(
    _val => 'slot',
    _slot => exampleAlice,
    {
      errorTagging: 'off',
      serializeBodyFormat: 'smallcaps',
    },
  );
  const wrongProto = harden({ ['__proto__']: exampleAlice });
  const wrongProtoSmallcaps = toSmallcaps(wrongProto);
  t.deepEqual(wrongProtoSmallcaps, {
    body: '#{"__proto__":"$0.Alleged: Alice"}',
    slots: ['slot'],
  });
  // Fails before https://github.com/endojs/endo/issues/1303 fix
  t.deepEqual(fromSmallcaps(wrongProtoSmallcaps), wrongProto);
});
