/* globals BigInt */

import { test } from 'tape-promise/tape';
import harden from '@agoric/harden';
import { makeMarshal, mustPassByPresence } from '../marshal';

// this only includes the tests that do not use liveSlots

test('serialize static data', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  t.throws(() => ser([1, 2]), /cannot pass non-frozen objects like .*/);
  t.deepEqual(ser(harden([1, 2])), { body: '[1,2]', slots: [] });
  t.deepEqual(ser(harden({ foo: 1 })), { body: '{"foo":1}', slots: [] });
  t.deepEqual(ser(true), { body: 'true', slots: [] });
  t.deepEqual(ser(1), { body: '1', slots: [] });
  t.deepEqual(ser('abc'), { body: '"abc"', slots: [] });
  t.deepEqual(ser(undefined), {
    body: '{"@qclass":"undefined"}',
    slots: [],
  });
  t.deepEqual(ser(-0), { body: '{"@qclass":"-0"}', slots: [] });
  t.deepEqual(ser(NaN), { body: '{"@qclass":"NaN"}', slots: [] });
  t.deepEqual(ser(Infinity), {
    body: '{"@qclass":"Infinity"}',
    slots: [],
  });
  t.deepEqual(ser(-Infinity), {
    body: '{"@qclass":"-Infinity"}',
    slots: [],
  });
  t.deepEqual(ser(Symbol.for('sym1')), {
    body: '{"@qclass":"symbol","key":"sym1"}',
    slots: [],
  });
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
  t.equal(Object.isFrozen(cd), true);
  t.equal(Object.isFrozen(cd.slots), true);

  t.end();
});

test('unserialize static data', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.equal(uns('1'), 1);
  t.equal(uns('"abc"'), 'abc');
  t.equal(uns('false'), false);

  // JS primitives that aren't natively representable by JSON
  t.deepEqual(uns('{"@qclass":"undefined"}'), undefined);
  t.ok(Object.is(uns('{"@qclass":"-0"}'), -0));
  t.notOk(Object.is(uns('{"@qclass":"-0"}'), 0));
  t.ok(Object.is(uns('{"@qclass":"NaN"}'), NaN));
  t.deepEqual(uns('{"@qclass":"Infinity"}'), Infinity);
  t.deepEqual(uns('{"@qclass":"-Infinity"}'), -Infinity);
  t.deepEqual(uns('{"@qclass":"symbol", "key":"sym1"}'), Symbol.for('sym1'));

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
  t.ok(em1 instanceof ReferenceError);
  t.equal(em1.message, 'msg');
  t.ok(Object.isFrozen(em1));

  const em2 = uns('{"@qclass":"error","name":"TypeError","message":"msg2"}');
  t.ok(em2 instanceof TypeError);
  t.equal(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","name":"Unknown","message":"msg3"}');
  t.ok(em3 instanceof Error);
  t.equal(em3.message, 'msg3');

  t.deepEqual(uns('[1,2]'), [1, 2]);
  t.deepEqual(uns('{"a":1,"b":2}'), { a: 1, b: 2 });
  t.deepEqual(uns('{"a":1,"b":{"c": 3}}'), { a: 1, b: { c: 3 } });

  // should be frozen
  const arr = uns('[1,2]');
  t.ok(Object.isFrozen(arr));
  const a = uns('{"b":{"c":{"d": []}}}');
  t.ok(Object.isFrozen(a));
  t.ok(Object.isFrozen(a.b));
  t.ok(Object.isFrozen(a.b.c));
  t.ok(Object.isFrozen(a.b.c.d));

  t.end();
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
  t.end();
});

test('forbid ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(
    () => uns('["a",{"@qclass":"ibid","index":0},"c"]'),
    /Ibid cycle at 0/,
  );
  t.end();
});

test('unserialize ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] }, 'warnOfCycles');
  const cycle = uns('["a",{"@qclass":"ibid","index":0},"c"]');
  t.ok(Object.is(cycle[1], cycle));
  t.end();
});

test('null cannot be pass-by-presence', t => {
  t.throws(() => mustPassByPresence(null), /null cannot be pass-by-presence/);
  t.end();
});

test('mal-formed @qclass', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('{"@qclass": 0}'), /invalid qclass/);
  t.end();
});
