import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('makeLoopback yields working near + far + registerInterface', async t => {
  const root = makeExo('root', undefined, {
    add(a, b) {
      return a + b;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface({ id: 0xa1n, methods: { add: 0 } });
  const remote = lb.near.getBootstrap();
  const sum1 = await E(remote).add(2, 3);
  t.is(sum1, 5);
  const sum2 = await E(remote).add(10, 20);
  t.is(sum2, 30);
});

test('makeLoopback shares an InterfaceRegistry across both ends', t => {
  const lb = makeLoopback();
  lb.registerInterface({ id: 0x1n, methods: { foo: 0 } });
  t.is(lb.near.interfaceRegistry, lb.far.interfaceRegistry);
  t.is(lb.near.interfaceRegistry.methodOrdinal(0x1n, 'foo'), 0);
});
