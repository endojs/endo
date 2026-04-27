import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('both sides can originate calls concurrently', async t => {
  const farRoot = makeExo('far', undefined, {
    pingFar() {
      return 'far-pong';
    },
  });
  const nearRoot = makeExo('near', undefined, {
    pingNear() {
      return 'near-pong';
    },
  });
  const { near, far, registerInterface } = makeLoopback({
    nearBootstrap: nearRoot,
    farBootstrap: farRoot,
  });
  registerInterface({ id: 0xc1n, methods: { pingFar: 0, pingNear: 1 } });
  const farRemote = near.getBootstrap();
  const nearRemote = far.getBootstrap();
  const [a, b] = await Promise.all([
    E(farRemote).pingFar(),
    E(nearRemote).pingNear(),
  ]);
  t.is(a, 'far-pong');
  t.is(b, 'near-pong');
});

test('many concurrent calls in both directions all complete', async t => {
  const farRoot = makeExo('far', undefined, {
    echo(x) {
      return `F:${x}`;
    },
  });
  const nearRoot = makeExo('near', undefined, {
    echo(x) {
      return `N:${x}`;
    },
  });
  const { near, far, registerInterface } = makeLoopback({
    nearBootstrap: nearRoot,
    farBootstrap: farRoot,
  });
  registerInterface({ id: 0xc2n, methods: { echo: 0 } });
  const farRemote = near.getBootstrap();
  const nearRemote = far.getBootstrap();
  const ps = [];
  for (let i = 0; i < 20; i += 1) {
    ps.push(E(farRemote).echo(i));
    ps.push(E(nearRemote).echo(i));
  }
  const results = await Promise.all(ps);
  for (let i = 0; i < 20; i += 1) {
    t.is(results[i * 2], `F:${i}`);
    t.is(results[i * 2 + 1], `N:${i}`);
  }
});
