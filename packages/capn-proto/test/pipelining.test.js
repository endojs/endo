import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('promise pipelining: chained call without intermediate await', async t => {
  const inner = makeExo('inner', undefined, {
    say(word) { return `inner says ${word}`; },
  });
  const outer = makeExo('outer', undefined, {
    getInner() { return inner; },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: outer });
  registerInterface({
    id: 0xabc1n,
    methods: { getInner: 0, say: 1 },
  });
  const remote = near.getBootstrap();
  // Pipelined: don't await getInner, just call say on the unresolved promise.
  const inP = E(remote).getInner();
  const result = await E(inP).say('hi');
  t.is(result, 'inner says hi');
});

test('pipelining preserves identity of the pipelined target', async t => {
  const inner = makeExo('inner', undefined, {
    name() { return 'inner'; },
  });
  const outer = makeExo('outer', undefined, {
    getInner() { return inner; },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: outer });
  registerInterface({
    id: 0xabc2n,
    methods: { getInner: 0, name: 1 },
  });
  const remote = near.getBootstrap();
  const a = E(remote).getInner();
  const aResolved = await a;
  // After resolution we should still get the same Presence as awaiting the
  // pipelined promise.
  const b = await E(remote).getInner();
  t.is(aResolved, b);
});
