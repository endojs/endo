// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('abort rejects outstanding questions', async t => {
  // A bootstrap that never returns is not directly possible (it returns
  // immediately), so we test by aborting after issuing a slow call.
  let resolveSlow;
  const slow = new Promise(resolve => {
    resolveSlow = resolve;
  });
  const root = makeExo('root', undefined, {
    slow() {
      return slow;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface({ id: 0xab0070n, methods: { slow: 0 } });
  const remote = near.getBootstrap();
  const slowP = E(remote).slow();
  near.abort('disconnected');
  await t.throwsAsync(slowP, { message: /disconnected/ });
  // satisfy the promise so it doesn't leak
  resolveSlow(undefined);
});
