/* global BigInt */

import '@agoric/install-ses';
import test from 'ava';
import {
  Remotable,
  getInterfaceOf,
  makeMarshal,
  mustPassByPresence,
} from '../marshal';

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
  t.throws(() => ser(Symbol.for('sym1')), { message: /Cannot pass symbols/ });
  // unregistered symbols
  t.throws(() => ser(Symbol('sym2')), { message: /Cannot pass symbols/ });
  // well known symbols
  t.throws(() => ser(Symbol.iterator), { message: /Cannot pass symbols/ });
  let bn;
  try {
    bn = BigInt(4);
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
    body: '{"@qclass":"error","name":"Error","message":""}',
    slots: [],
  });

  let em;
  try {
    throw new ReferenceError('msg');
  } catch (e) {
    em = harden(e);
  }
  t.deepEqual(ser(em), {
    body: '{"@qclass":"error","name":"ReferenceError","message":"msg"}',
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

  // Normal json reviver cannot make properties with undefined values
  t.deepEqual(uns('[{"@qclass":"undefined"}]'), [undefined]);
  t.deepEqual(uns('{"foo": {"@qclass":"undefined"}}'), { foo: undefined });
  let bn;
  try {
    bn = BigInt(4);
  } catch (e) {
    if (!(e instanceof ReferenceError)) {
      throw e;
    }
  }
  if (bn) {
    t.deepEqual(uns('{"@qclass":"bigint","digits":"1234"}'), BigInt(1234));
  }

  const em1 = uns(
    '{"@qclass":"error","name":"ReferenceError","message":"msg"}',
  );
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(Object.isFrozen(em1));

  const em2 = uns('{"@qclass":"error","name":"TypeError","message":"msg2"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","name":"Unknown","message":"msg3"}');
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

test('null cannot be pass-by-presence', t => {
  t.throws(() => mustPassByPresence(null), {
    message: /null cannot be pass-by-remote/,
  });
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
    () => Remotable('Alleged: MyHandle', { foo: 123 }),
    { message: /cannot serialize/ },
    'non-function props are not implemented',
  );
  t.throws(
    () => Remotable('Alleged: MyHandle', {}, a => a + 1),
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
  const p = Remotable('Alleged: MyHandle');
  harden(p);
  // console.log(p);
  t.is(getInterfaceOf(p), 'Alleged: MyHandle', `interface is MyHandle`);
  t.is(`${p}`, '[Alleged: MyHandle]', 'stringify is [MyHandle]');

  const p2 = Remotable('Alleged: Thing', {
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
});
