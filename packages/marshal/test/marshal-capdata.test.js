import test from '@endo/ses-ava/prepare-endo.js';

import { passStyleOf, Far, unpassableSymbolForName } from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';
import { roundTripPairs } from '../tools/marshal-test-data.js';

const {
  freeze,
  isFrozen,
  create,
  prototype: objectPrototype,
  getPrototypeOf,
} = Object;

const harden = /** @type {import('ses').Harden & { isFake?: boolean }} */ (
  // eslint-disable-next-line no-undef
  global.harden
);

// Unknown error names decode as generic Errors.
// TODO: Remove after dropping support for pre-AggregateError implementations.
const supportsAggregateError = typeof AggregateError !== 'undefined';
const decodedAggregateErrorCtor = supportsAggregateError
  ? AggregateError
  : Error;
const testIfAggregateError = supportsAggregateError ? test : test.skip;

// this only includes the tests that do not use liveSlots

/**
 * @param {import('../src/types.js').MakeMarshalOptions} [opts]
 */
const makeTestMarshal = (opts = { errorTagging: 'off' }) =>
  makeMarshal(undefined, undefined, {
    serializeBodyFormat: 'capdata',
    marshalSaveError: _err => {},
    ...opts,
  });

test('serialize unserialize round trip pairs', t => {
  const { serialize, unserialize } = makeMarshal(undefined, undefined, {
    // TODO errorTagging will only be recognized once we merge with PR #2437
    // We're turning it off only for the round trip test, not in general.
    errorTagging: 'off',
    serializeBodyFormat: 'capdata',
  });
  for (const [plain, encoded] of roundTripPairs) {
    const { body } = serialize(plain);
    const encoding = JSON.stringify(encoded);
    t.is(body, encoding);
    const decoding = unserialize({ body, slots: [] });
    t.deepEqual(decoding, plain);
    t.assert(isFrozen(decoding));
  }
});

test('serialize static data', t => {
  const m = makeTestMarshal();
  const ser = val => m.serialize(val);

  if (!harden.isFake) {
    t.throws(() => ser([1, 2]), {
      message: /Cannot pass non-frozen objects like/,
    });
  }
  // -0 serialized as 0
  t.deepEqual(ser(0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), ser(0));
  // unregistered symbols
  t.throws(() => ser(unpassableSymbolForName('sym2')), {
    message:
      'Only registered symbols or well-known symbols are passable: "[Symbol(sym2)]"',
  });

  const cd = ser(harden([1, 2]));
  t.is(isFrozen(cd), true);
  t.is(isFrozen(cd.slots), true);
});

test('unserialize static data', t => {
  const m = makeTestMarshal();
  const uns = body => m.unserialize({ body, slots: [] });

  // should be frozen
  const arr = uns('[1,2]');
  t.truthy(isFrozen(arr));
  const a = uns('{"b":{"c":{"d": []}}}');
  t.truthy(isFrozen(a));
  t.truthy(isFrozen(a.b));
  t.truthy(isFrozen(a.b.c));
  t.truthy(isFrozen(a.b.c.d));
});

test('serialize errors', t => {
  const m = makeTestMarshal({ errorTagging: 'on' });
  const ser = val => m.serialize(val);

  t.deepEqual(ser(harden(Error())), {
    body: '{"@qclass":"error","errorId":"error:anon-marshal#10001","message":"","name":"Error"}',
    slots: [],
  });

  t.deepEqual(ser(harden(ReferenceError('msg'))), {
    body: '{"@qclass":"error","errorId":"error:anon-marshal#10002","message":"msg","name":"ReferenceError"}',
    slots: [],
  });

  // TODO Once https://github.com/Agoric/SES-shim/issues/579 is merged
  // do a golden of the error notes generated by the following

  // Extra properties
  const errExtra = Error('has extra properties');
  // @ts-expect-error Check dynamic consequences of type violation
  errExtra.foo = [];
  freeze(errExtra);
  t.assert(isFrozen(errExtra));
  if (!harden.isFake) {
    // @ts-expect-error Check dynamic consequences of type violation
    t.falsy(isFrozen(errExtra.foo));
  }
  t.deepEqual(ser(errExtra), {
    body: '{"@qclass":"error","errorId":"error:anon-marshal#10003","message":"has extra properties","name":"Error"}',
    slots: [],
  });
  if (!harden.isFake) {
    // @ts-expect-error Check dynamic consequences of type violation
    t.falsy(isFrozen(errExtra.foo));
  }

  // Bad prototype and bad "message" property
  const nonErrorProto1 = harden({
    __proto__: Error.prototype,
    name: 'included',
  });
  const nonError1 = harden({ __proto__: nonErrorProto1, message: [] });
  t.deepEqual(ser(nonError1), {
    body: '{"@qclass":"error","errorId":"error:anon-marshal#10004","message":"","name":"included"}',
    slots: [],
  });
});

test('unserialize errors', t => {
  const m = makeTestMarshal();
  const uns = body => m.unserialize({ body, slots: [] });

  const em1 = uns(
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
  );
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(isFrozen(em1));

  const em2 = uns('{"@qclass":"error","message":"msg2","name":"TypeError"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","message":"msg3","name":"Unknown"}');
  t.truthy(em3 instanceof Error);
  t.is(em3.message, 'msg3');
});

test('unserialize extended errors', t => {
  const { unserialize } = makeTestMarshal();
  const uns = body => unserialize({ body, slots: [] });

  const refErr = uns(
    '{"@qclass":"error","message":"msg","name":"ReferenceError","extraProp":"foo","cause":"bar","errors":["zip","zap"]}',
  );
  t.is(getPrototypeOf(refErr), ReferenceError.prototype); // direct instance of
  t.false('extraProp' in refErr);
  t.false('cause' in refErr);
  t.false('errors' in refErr);

  const aggErr = uns(
    '{"@qclass":"error","message":"msg","name":"AggregateError","extraProp":"foo","cause":"bar","errors":["zip","zap"]}',
  );
  t.is(getPrototypeOf(aggErr), decodedAggregateErrorCtor.prototype); // direct instance of
  t.false('extraProp' in aggErr);
  t.false('cause' in aggErr);
  if (supportsAggregateError) {
    t.is(aggErr.errors.length, 0);
  } else {
    t.false('errors' in aggErr);
  }

  const unkErr = uns(
    '{"@qclass":"error","message":"msg","name":"UnknownError","extraProp":"foo","cause":"bar","errors":["zip","zap"]}',
  );
  t.is(getPrototypeOf(unkErr), Error.prototype); // direct instance of
  t.false('extraProp' in unkErr);
  t.false('cause' in unkErr);
  t.false('errors' in unkErr);
});

testIfAggregateError('unserialize recognized error extensions', t => {
  const { unserialize } = makeTestMarshal();
  const uns = body => unserialize({ body, slots: [] });

  const errEnc = '{"@qclass":"error","message":"msg","name":"URIError"}';

  const refErr = uns(
    `{"@qclass":"error","message":"msg","name":"ReferenceError","extraProp":"foo","cause":${errEnc},"errors":[${errEnc}]}`,
  );
  t.is(getPrototypeOf(refErr), ReferenceError.prototype); // direct instance of
  t.false('extraProp' in refErr);
  t.is(getPrototypeOf(refErr.cause), URIError.prototype);
  t.is(getPrototypeOf(refErr.errors[0]), URIError.prototype);

  const aggErr = uns(
    `{"@qclass":"error","message":"msg","name":"AggregateError","extraProp":"foo","cause":${errEnc},"errors":[${errEnc}]}`,
  );
  t.is(getPrototypeOf(aggErr), decodedAggregateErrorCtor.prototype); // direct instance of
  t.false('extraProp' in aggErr);
  t.is(getPrototypeOf(aggErr.cause), URIError.prototype);
  t.is(getPrototypeOf(aggErr.errors[0]), URIError.prototype);

  const unkErr = uns(
    `{"@qclass":"error","message":"msg","name":"UnknownError","extraProp":"foo","cause":${errEnc},"errors":[${errEnc}]}`,
  );
  t.is(getPrototypeOf(unkErr), Error.prototype); // direct instance of
  t.false('extraProp' in unkErr);
  t.is(getPrototypeOf(unkErr.cause), URIError.prototype);
  t.is(getPrototypeOf(unkErr.errors[0]), URIError.prototype);
});

test('passStyleOf null is "null"', t => {
  t.assert(passStyleOf(null), 'null');
});

test('mal-formed @qclass', t => {
  const m = makeTestMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('{"@qclass": 0}'), {
    message: /invalid "@qclass" typeof "number"*/,
  });
});

test('records', t => {
  const fauxPresence = harden({});
  const { serialize: ser, unserialize: unser } = makeMarshal(
    _val => 'slot',
    _slot => fauxPresence,
    {
      errorTagging: 'off',
      serializeBodyFormat: 'capdata',
    },
  );

  const emptyData = { body: JSON.stringify({}), slots: [] };

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

  if (!harden.isFake) {
    // rejected because it is not hardened
    t.throws(
      () => ser({}),
      { message: /Cannot pass non-frozen objects/ },
      'non-frozen data cannot be serialized',
    );
  }

  // harden({})
  t.deepEqual(ser(build()), emptyData);

  const stringData = { body: JSON.stringify({ enumData: 'data' }), slots: [] };

  // serialized data should roundtrip properly
  t.deepEqual(unser(ser(harden({}))), {});
  t.deepEqual(unser(ser(harden({ enumData: 'data' }))), { enumData: 'data' });

  // unserialized data can be serialized again
  t.deepEqual(ser(unser(emptyData)), emptyData);
  t.deepEqual(ser(unser(stringData)), stringData);

  // { key: data }
  // all: pass-by-copy without warning
  t.deepEqual(ser(build({ enumData })), {
    body: '{"enumData":"data"}',
    slots: [],
  });

  // anything with an accessor is rejected
  t.throws(() => ser(build({ enumGetData })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumGetData, enumData })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumSet })), ERR_NOACCESSORS);
  t.throws(() => ser(build({ enumSet, enumData })), ERR_NOACCESSORS);

  // anything with a non-enumerable property is rejected
  t.throws(() => ser(build({ nonenumData })), ERR_ONLYENUMERABLE);
  t.throws(() => ser(build({ nonenumData, enumData })), ERR_ONLYENUMERABLE);

  // anything with a function-returning getter is treated as remotable
  t.throws(() => ser(build({ enumGetFunc })), ERR_REMOTABLE);
  t.throws(() => ser(build({ enumData, enumGetFunc })), ERR_REMOTABLE);
});

test('capdata proto problems', t => {
  const exampleAlice = Far('Alice', {});
  const { serialize: toCapData, unserialize: fromCapData } = makeMarshal(
    _val => 'slot',
    _slot => exampleAlice,
    {
      errorTagging: 'off',
      serializeBodyFormat: 'capdata',
    },
  );
  const wrongProto = harden({ ['__proto__']: exampleAlice });
  const wrongProtoCapData = toCapData(wrongProto);
  t.deepEqual(wrongProtoCapData, {
    body: '{"__proto__":{"@qclass":"slot","iface":"Alleged: Alice","index":0}}',
    slots: ['slot'],
  });
  // Fails before https://github.com/endojs/endo/issues/1303 fix
  t.deepEqual(fromCapData(wrongProtoCapData), wrongProto);
});

test('capdata slot leniency', t => {
  const { unserialize: fromCapData } = makeMarshal(
    undefined,
    _slot => ({
      name: 'I should not be in a slot',
    }),
    {
      errorTagging: 'off',
      serializeBodyFormat: 'capdata',
    },
  );
  t.deepEqual(
    fromCapData({
      body: '[{"@qclass":"slot","index":0}]',
      slots: ['ignored'],
    }),
    [{ name: 'I should not be in a slot' }],
  );
});
