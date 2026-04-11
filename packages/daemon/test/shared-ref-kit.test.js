// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/pass-style';
import { E } from '@endo/far';
import { makeSharedRefKit } from '../src/shared-ref-kit.js';

test('makeSharedRefKit wraps target and exposes controller surface', async t => {
  const target = Far('Counter', {
    inc: n => n + 1,
    label: () => 'original',
  });

  const { shared, controller } = makeSharedRefKit(target, {
    kind: 'opaque',
    label: 'counter-share',
  });

  t.is(await E(shared).inc(1), 2);
  t.is(await E(shared).label(), 'original');
  t.true(await E(controller).isLive());
  t.is(await E(controller).getLabel(), 'counter-share');
  t.is(await E(controller).getKind(), 'opaque');
  t.regex(await E(controller).help(), /SharedRef \[opaque\] counter-share/);
});

test('controller.revoke() kills the proxy terminally', async t => {
  const target = Far('Counter', {
    inc: n => n + 1,
  });

  const { shared, controller } = makeSharedRefKit(target, {
    kind: 'opaque',
    label: 'to-be-revoked',
  });

  t.is(await E(shared).inc(1), 2);

  await E(controller).revoke('no longer needed');

  t.false(await E(controller).isLive());
  await t.throwsAsync(() => E(shared).inc(1), {
    message: /Revoked: no longer needed/,
  });
});

test('revoke is idempotent', async t => {
  const target = Far('X', { ping: () => 'pong' });
  const { shared, controller } = makeSharedRefKit(target, {
    kind: 'opaque',
    label: 'idem',
  });

  await E(controller).revoke('first');
  // Second revoke is a no-op; should not throw and should not change state.
  await E(controller).revoke('second');
  t.false(await E(controller).isLive());
  await t.throwsAsync(() => E(shared).ping(), {
    message: /Revoked: first/,
  });
});

test('revoke with no reason defaults to "revoked"', async t => {
  const target = Far('X', { ping: () => 'pong' });
  const { shared, controller } = makeSharedRefKit(target, {
    kind: 'opaque',
    label: 'no-reason',
  });

  await E(controller).revoke();
  await t.throwsAsync(() => E(shared).ping(), {
    message: /Revoked: revoked/,
  });
});
