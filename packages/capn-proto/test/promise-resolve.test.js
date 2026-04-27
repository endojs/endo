// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('returning a Promise emits Resolve and settles the import', async t => {
  let res;
  const pending = new Promise(r => {
    res = r;
  });
  const inner = makeExo('inner', undefined, {
    tag() {
      return 'inner';
    },
  });
  const root = makeExo('root', undefined, {
    pendingInner() {
      return pending;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface({ id: 0xa55en, methods: { pendingInner: 0, tag: 1 } });
  const remote = near.getBootstrap();
  const p = E(remote).pendingInner();
  // Settle on the far side after a tick.
  res(inner);
  const remoteInner = await p;
  const tag = await E(remoteInner).tag();
  t.is(tag, 'inner');
});

test('rejected far-side promise is delivered as exception', async t => {
  let rej;
  const pending = new Promise((_r, r2) => {
    rej = r2;
  });
  const root = makeExo('root', undefined, {
    pending() {
      return pending;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface({ id: 0xa55fn, methods: { pending: 0 } });
  const remote = near.getBootstrap();
  const p = E(remote).pending();
  rej(Error('rejected'));
  await t.throwsAsync(p, { message: /rejected/ });
});
