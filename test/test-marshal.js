import '@agoric/install-ses';
import test from 'ava';
import {
  Remotable,
  Far,
  // Data,
  getInterfaceOf,
  makeMarshal,
  passStyleOf,
} from '../src/marshal';

// this only includes the tests that do not use liveSlots

test('serialize static data', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  t.throws(() => ser([1, 2]), {
    message: /Cannot pass non-frozen objects like/,
  });
  t.deepEqual(ser(harden([1, 2])), { body: '[1,2]', slots: [] });
  t.deepEqual(ser(harden({ foo: 1 })), { body: '{"foo":1}', slots: [] });
  t.deepEqual(ser(true), { body: 'true', slots: [] });
  t.deepEqual(ser(1), { body: '1', slots: [] });
  t.deepEqual(ser('abc'), { body: '"abc"', slots: [] });
  t.deepEqual(ser(undefined), {
    body: '{"@qclass":"undefined"}',
    slots: [],
  });
  // -0 serialized as 0
  t.deepEqual(ser(0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), ser(0));
  t.deepEqual(ser(NaN), { body: '{"@qclass":"NaN"}', slots: [] });
  t.deepEqual(ser(Infinity), {
    body: '{"@qclass":"Infinity"}',
    slots: [],
  });
  t.deepEqual(ser(-Infinity), {
    body: '{"@qclass":"-Infinity"}',
    slots: [],
  });
  // registered symbols
  t.throws(() => ser(Symbol.for('sym1')), { message: /Unsupported symbol/ });
  // unregistered symbols
  t.throws(() => ser(Symbol('sym2')), { message: /Unsupported symbol/ });
  // well known unsupported symbols
  t.throws(() => ser(Symbol.iterator), { message: /Unsupported symbol/ });
  // well known supported symbols
  t.deepEqual(ser(Symbol.asyncIterator), {
    body: '{"@qclass":"@@asyncIterator"}',
    slots: [],
  });
  let bn;
  try {
    bn = 4n;
  } catch (e) {
    if (!(e instanceof ReferenceError)) {
      throw e;
    }
  }
  if (bn) {
    t.deepEqual(ser(bn), {
      body: '{"@qclass":"bigint","digits":"4"}',
      slots: [],
    });
  }

  let emptyem;
  try {
    throw new Error();
  } catch (e) {
    emptyem = harden(e);
  }
  t.deepEqual(ser(emptyem), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#1","message":"","name":"Error"}',
    slots: [],
  });

  let em;
  try {
    throw new ReferenceError('msg');
  } catch (e) {
    em = harden(e);
  }
  t.deepEqual(ser(em), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#2","message":"msg","name":"ReferenceError"}',
    slots: [],
  });

  const cd = ser(harden([1, 2]));
  t.is(Object.isFrozen(cd), true);
  t.is(Object.isFrozen(cd.slots), true);
});

test('unserialize static data', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.is(uns('1'), 1);
  t.is(uns('"abc"'), 'abc');
  t.is(uns('false'), false);

  // JS primitives that aren't natively representable by JSON
  t.deepEqual(uns('{"@qclass":"undefined"}'), undefined);
  t.truthy(Object.is(uns('{"@qclass":"NaN"}'), NaN));
  t.deepEqual(uns('{"@qclass":"Infinity"}'), Infinity);
  t.deepEqual(uns('{"@qclass":"-Infinity"}'), -Infinity);
  t.deepEqual(uns('{"@qclass":"@@asyncIterator"}'), Symbol.asyncIterator);

  // Normal json reviver cannot make properties with undefined values
  t.deepEqual(uns('[{"@qclass":"undefined"}]'), [undefined]);
  t.deepEqual(uns('{"foo": {"@qclass":"undefined"}}'), { foo: undefined });
  let bn;
  try {
    bn = 4n;
  } catch (e) {
    if (!(e instanceof ReferenceError)) {
      throw e;
    }
  }
  if (bn) {
    t.deepEqual(uns('{"@qclass":"bigint","digits":"1234"}'), 1234n);
  }

  const em1 = uns(
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
  );
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(Object.isFrozen(em1));

  const em2 = uns('{"@qclass":"error","message":"msg2","name":"TypeError"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","message":"msg3","name":"Unknown"}');
  t.truthy(em3 instanceof Error);
  t.is(em3.message, 'msg3');

  t.deepEqual(uns('[1,2]'), [1, 2]);
  t.deepEqual(uns('{"a":1,"b":2}'), { a: 1, b: 2 });
  t.deepEqual(uns('{"a":1,"b":{"c": 3}}'), { a: 1, b: { c: 3 } });

  // should be frozen
  const arr = uns('[1,2]');
  t.truthy(Object.isFrozen(arr));
  const a = uns('{"b":{"c":{"d": []}}}');
  t.truthy(Object.isFrozen(a));
  t.truthy(Object.isFrozen(a.b));
  t.truthy(Object.isFrozen(a.b.c));
  t.truthy(Object.isFrozen(a.b.c.d));
});

test('serialize ibid cycle', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  const cycle = ['a', 'x', 'c'];
  cycle[1] = cycle;
  harden(cycle);

  t.deepEqual(ser(cycle), {
    body: '["a",{"@qclass":"ibid","index":0},"c"]',
    slots: [],
  });
});

test('forbid ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('["a",{"@qclass":"ibid","index":0},"c"]'), {
    message: /Ibid cycle at 0/,
  });
});

test('unserialize ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] }, 'warnOfCycles');
  const cycle = uns('["a",{"@qclass":"ibid","index":0},"c"]');
  t.truthy(Object.is(cycle[1], cycle));
});

test('passStyleOf null is "null"', t => {
  t.assert(passStyleOf(null), 'null');
});

test('mal-formed @qclass', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('{"@qclass": 0}'), { message: /invalid qclass/ });
});

test('Remotable/getInterfaceOf', t => {
  t.throws(
    () => Remotable({ bar: 29 }),
    { message: /unimplemented/ },
    'object ifaces are not implemented',
  );
  t.throws(
    () => Far('MyHandle', { foo: 123 }),
    { message: /cannot serialize/ },
    'non-function props are not implemented',
  );
  t.throws(
    () => Far('MyHandle', a => a + 1),
    { message: /cannot serialize/ },
    'function presences are not implemented',
  );

  t.is(getInterfaceOf('foo'), undefined, 'string, no interface');
  t.is(getInterfaceOf(null), undefined, 'null, no interface');
  t.is(
    getInterfaceOf(a => a + 1),
    undefined,
    'function, no interface',
  );
  t.is(getInterfaceOf(123), undefined, 'number, no interface');

  // Check that a handle can be created.
  const p = Far('MyHandle');
  harden(p);
  // console.log(p);
  t.is(getInterfaceOf(p), 'Alleged: MyHandle', `interface is MyHandle`);
  t.is(`${p}`, '[Alleged: MyHandle]', 'stringify is [MyHandle]');

  const p2 = Far('Thing', {
    name() {
      return 'cretin';
    },
    birthYear(now) {
      return now - 64;
    },
  });
  t.is(getInterfaceOf(p2), 'Alleged: Thing', `interface is Thing`);
  t.is(p2.name(), 'cretin', `name() method is presence`);
  t.is(p2.birthYear(2020), 1956, `birthYear() works`);

  // Remotables and Fars can be serialized, of course
  function convertValToSlot(_val) {
    return 'slot';
  }
  const m = makeMarshal(convertValToSlot);
  t.deepEqual(m.serialize(p2), {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: Thing',
      index: 0,
    }),
    slots: ['slot'],
  });
});

test('records', t => {
  function convertValToSlot(_val) {
    return 'slot';
  }
  const presence = harden({});
  function convertSlotToVal(_slot) {
    return presence;
  }
  const m = makeMarshal(convertValToSlot, convertSlotToVal);
  const ser = val => m.serialize(val);
  const noIface = {
    body: JSON.stringify({ '@qclass': 'slot', index: 0 }),
    slots: ['slot'],
  };
  const yesIface = {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: iface',
      index: 0,
    }),
    slots: ['slot'],
  };
  // const emptyData = { body: JSON.stringify({}), slots: [] };

  // For objects with Symbol-named properties
  const sym1 = Symbol.for('sym1');
  const sym2 = Symbol.for('sym2');
  const sym3 = Symbol.for('sym3');
  const sym4 = Symbol.for('sym4');

  function build(...opts) {
    const props = {};
    let mark;
    for (const opt of opts) {
      if (opt === 'enumStringData') {
        props.key1 = { enumerable: true, value: 'data' };
      } else if (opt === 'enumStringFunc') {
        props.key2 = { enumerable: true, value: () => 0 };
      } else if (opt === 'enumStringGet') {
        props.key3 = { enumerable: true, get: () => 0 };
      } else if (opt === 'enumSymbolData') {
        props[sym1] = { enumerable: true, value: 2 };
      } else if (opt === 'enumSymbolFunc') {
        props[sym2] = { enumerable: true, value: () => 0 };
      } else if (opt === 'nonenumStringData') {
        props.key4 = { enumerable: false, value: 3 };
      } else if (opt === 'nonenumStringFunc') {
        props.key5 = { enumerable: false, value: () => 0 };
      } else if (opt === 'nonenumSymbolData') {
        props[sym3] = { enumerable: false, value: 4 };
      } else if (opt === 'nonenumSymbolFunc') {
        props[sym4] = { enumerable: false, value: () => 0 };
      } else if (opt === 'data') {
        mark = 'data';
      } else if (opt === 'far') {
        mark = 'far';
      } else {
        throw Error(`unknown option ${opt}`);
      }
    }
    const o = Object.create(Object.prototype, props);
    // if (mark === 'data') {
    //   return Data(o);
    // }
    if (mark === 'far') {
      return Far('iface', o);
    }
    return harden(o);
  }

  function shouldThrow(opts, message = /XXX/) {
    t.throws(() => ser(build(...opts)), { message });
  }
  const CSO = /cannot serialize objects/;
  const NOACC = /Records must not contain accessors/;
  const RECENUM = /Record fields must be enumerable/;
  const NOMETH = /cannot serialize objects with non-methods/;

  // empty objects

  // rejected because it is not hardened
  t.throws(
    () => ser({}),
    { message: /Cannot pass non-frozen objects/ },
    'non-frozen data cannot be serialized',
  );

  // harden({})
  // old: pass-by-ref without complaint
  // interim1: pass-by-ref with warning
  // interim2: rejected
  // final: pass-by-copy without complaint
  t.deepEqual(ser(build()), noIface); // old+interim1
  // t.throws(() => ser(harden({})), { message: /??/ }, 'unmarked empty object rejected'); // int2
  // t.deepEqual(ser(build()), emptyData); // final

  // Data({})
  // old: not applicable, Data() not yet added
  // interim1: pass-by-copy without warning
  // interim2: pass-by-copy without warning
  // final: not applicable, Data() removed
  // t.deepEqual(build('data'), emptyData); // interim 1+2

  // Far('iface', {})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far')), yesIface);

  // Far('iface', {key: func})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far', 'enumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'enumSymbolFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumSymbolFunc')), yesIface);

  // { key: data }
  // all: pass-by-copy without warning
  t.deepEqual(ser(build('enumStringData')), {
    body: '{"key1":"data"}',
    slots: [],
  });

  // { key: func }
  // old: pass-by-ref without warning
  // interim1: pass-by-ref with warning
  // interim2: reject
  // final: reject
  t.deepEqual(ser(build('enumStringFunc')), noIface);
  t.deepEqual(ser(build('enumSymbolFunc')), noIface);
  t.deepEqual(ser(build('nonenumStringFunc')), noIface);
  t.deepEqual(ser(build('nonenumSymbolFunc')), noIface);

  // Data({ key: data, key: func }) : rejected
  // shouldThrow('data', 'enumStringData', 'enumStringFunc');

  // Far('iface', { key: data, key: func }) : rejected
  // (some day this might add auxilliary data, but not now
  shouldThrow(['far', 'enumStringData', 'enumStringFunc'], CSO);

  // anything with getters is rejected
  shouldThrow(['enumStringGet'], NOACC);
  shouldThrow(['enumStringGet', 'enumStringData'], NOACC);
  shouldThrow(['enumStringGet', 'enumStringFunc'], CSO);

  // anything with symbols can only be a remotable
  shouldThrow(['enumSymbolData'], NOMETH);
  shouldThrow(['enumSymbolData', 'enumStringData'], NOMETH);
  shouldThrow(['enumSymbolData', 'enumStringFunc'], NOMETH);

  shouldThrow(['nonenumSymbolData'], NOMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringData'], NOMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringFunc'], NOMETH);

  // anything with non-enumerable properties is rejected
  shouldThrow(['nonenumStringData'], RECENUM);
  shouldThrow(['nonenumStringData', 'enumStringData'], RECENUM);
  shouldThrow(['nonenumStringData', 'enumStringFunc'], NOMETH);
});
