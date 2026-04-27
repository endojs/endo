import test from '@endo/ses-ava/test.js';
import { makeInterfaceRegistry } from '../src/interfaces.js';

test('register, lookup, ordinal-from-name', t => {
  const reg = makeInterfaceRegistry();
  reg.register({ id: 0xaaaaaaaaaaaaaaaan, methods: { hello: 0, goodbye: 1 } });
  t.is(reg.methodOrdinal(0xaaaaaaaaaaaaaaaan, 'hello'), 0);
  t.is(reg.methodOrdinal(0xaaaaaaaaaaaaaaaan, 'goodbye'), 1);
  t.is(reg.methodOrdinal(0xaaaaaaaaaaaaaaaan, 'missing'), undefined);
  t.is(reg.methodName(0xaaaaaaaaaaaaaaaan, 0), 'hello');
  t.is(reg.methodName(0xaaaaaaaaaaaaaaaan, 1), 'goodbye');
  t.true(reg.has(0xaaaaaaaaaaaaaaaan));
});

test('idempotent re-registration of identical map', t => {
  const reg = makeInterfaceRegistry();
  reg.register({ id: 0x1n, methods: { foo: 0 } });
  reg.register({ id: 0x1n, methods: { foo: 0 } });
  t.is(reg.methodOrdinal(0x1n, 'foo'), 0);
});

test('rejects non-bigint id', t => {
  const reg = makeInterfaceRegistry();
  t.throws(() => reg.register({ id: 1, methods: {} }));
});

test('rejects duplicate ordinals', t => {
  const reg = makeInterfaceRegistry();
  t.throws(() => reg.register({ id: 0x1n, methods: { a: 0, b: 0 } }));
});

test('rejects ordinals out of uint16 range', t => {
  const reg = makeInterfaceRegistry();
  t.throws(() => reg.register({ id: 0x1n, methods: { a: -1 } }));
  t.throws(() => reg.register({ id: 0x2n, methods: { a: 0x10000 } }));
});

test('iterate visits all registered interfaces', t => {
  const reg = makeInterfaceRegistry();
  reg.register({ id: 0x1n, methods: { a: 0 } });
  reg.register({ id: 0x2n, methods: { b: 1 } });
  const ids = [];
  for (const desc of reg.iterate()) ids.push(desc.id);
  t.deepEqual(ids.sort(), [0x1n, 0x2n]);
});
