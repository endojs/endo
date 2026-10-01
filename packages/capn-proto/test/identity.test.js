import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';
import { withJsonCodecs } from './fixtures/json-codec.js';

test('reference equality preserved for the same far cap re-imported', async t => {
  const inner = makeExo('inner', undefined, {
    name() {
      return 'inner';
    },
  });
  const root = makeExo('root', undefined, {
    getInner() {
      return inner;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface(
    withJsonCodecs({ id: 0x1n, methods: { getInner: 0, name: 1 } }),
  );
  const remote = near.getBootstrap();
  const a = await E(remote).getInner();
  const b = await E(remote).getInner();
  t.is(a, b, 'two getInner calls return the same Presence');
});

test('passing a remote presence back returns the original local value (round-trip)', async t => {
  const sentinel = makeExo('sentinel', undefined, {
    tag() {
      return 'sentinel';
    },
  });
  const root = makeExo('root', undefined, {
    getSentinel() {
      return sentinel;
    },
    isSentinel(s) {
      return s === sentinel;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface(
    withJsonCodecs({
      id: 0x2n,
      methods: { getSentinel: 0, isSentinel: 1, tag: 2 },
    }),
  );
  const remote = near.getBootstrap();
  const remoteSentinel = await E(remote).getSentinel();
  const sameOrigin = await E(remote).isSentinel(remoteSentinel);
  t.true(sameOrigin, 'far side recognized its own object after a round-trip');
});
