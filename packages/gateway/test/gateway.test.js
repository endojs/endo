// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import { E } from '@endo/eventual-send';

import {
  makeGateway,
  DEFAULT_BIND_ADDRESS,
  defaultFeatureToggles,
} from '../index.js';

test('makeGateway returns a hardened exo', t => {
  const gateway = makeGateway();
  t.true(Object.isFrozen(gateway));
});

test('makeGateway defaults to ENDO_HTTP_ADDR fallback', async t => {
  const gateway = makeGateway();
  const bindAddress = await E(gateway).getBindAddress();
  t.is(bindAddress, DEFAULT_BIND_ADDRESS);
});

test('makeGateway reads ENDO_HTTP_ADDR from powers.env', async t => {
  const gateway = makeGateway({
    powers: { env: { ENDO_HTTP_ADDR: '127.0.0.1:0' } },
  });
  const bindAddress = await E(gateway).getBindAddress();
  t.is(bindAddress, '127.0.0.1:0');
});

test('makeGateway env beats explicit config', async t => {
  // Per the design's Configuration Model: environment is the
  // third (last-wins) layer. If a refactor inverts this order,
  // an operator's `ENDO_HTTP_ADDR` is silently ignored when the
  // host also supplies a `bindAddress` in config.
  const gateway = makeGateway({
    powers: { env: { ENDO_HTTP_ADDR: '127.0.0.1:0' } },
    config: { bindAddress: '0.0.0.0:9999' },
  });
  const bindAddress = await E(gateway).getBindAddress();
  t.is(bindAddress, '127.0.0.1:0');
});

test('makeGateway with explicit config and no env honors config', async t => {
  const gateway = makeGateway({
    config: { bindAddress: '127.0.0.1:8920' },
  });
  const bindAddress = await E(gateway).getBindAddress();
  t.is(bindAddress, '127.0.0.1:8920');
});

test('makeGateway with bracketed IPv6 round-trips the address', async t => {
  const gateway = makeGateway({
    config: { bindAddress: '[::1]:8920' },
  });
  const bindAddress = await E(gateway).getBindAddress();
  t.is(bindAddress, '[::1]:8920');
});

test('Gateway lifecycle: start then stop', async t => {
  const gateway = makeGateway();
  await E(gateway).start();
  await E(gateway).stop();
  t.pass();
});

test('Gateway start is idempotent', async t => {
  const gateway = makeGateway();
  await E(gateway).start();
  await E(gateway).start();
  t.pass();
});

test('Gateway start after stop is an error', async t => {
  // A restart after stop is a follow-on responsibility (the
  // network surface and registration table reset are not yet
  // designed). Until then, stop is terminal; this assertion
  // pins the contract.
  const gateway = makeGateway();
  await E(gateway).start();
  await E(gateway).stop();
  await t.throwsAsync(() => E(gateway).start(), {
    message: /has been stopped and cannot restart/,
  });
});

test('Gateway stop is idempotent', async t => {
  const gateway = makeGateway();
  await E(gateway).stop();
  await E(gateway).stop();
  t.pass();
});

test('Gateway getApps returns an AppsNameHub', async t => {
  const gateway = makeGateway();
  const apps = await E(gateway).getApps();
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  t.is(await E(apps).lookup('chat.example.com'), 'weblet-id-abc');
});

test('Gateway getApps returns the same hub on repeated calls', async t => {
  // Repeated calls must return the same hub; otherwise bindings
  // a host agent installs on one call vanish on the next.
  const gateway = makeGateway();
  const apps1 = await E(gateway).getApps();
  await E(apps1).bind('chat.example.com', 'weblet-id-abc');
  const apps2 = await E(gateway).getApps();
  t.is(await E(apps2).lookup('chat.example.com'), 'weblet-id-abc');
});

test('Gateway getConfig returns the merged, hardened config', async t => {
  const gateway = makeGateway({
    config: {
      bindAddress: '127.0.0.1:0',
      enableFeatures: { ...defaultFeatureToggles, gitHttp: false },
    },
  });
  const cfg = await E(gateway).getConfig();
  t.is(cfg.bindAddress, '127.0.0.1:0');
  t.false(cfg.enableFeatures.gitHttp);
  t.true(Object.isFrozen(cfg));
  t.true(Object.isFrozen(cfg.enableFeatures));
});
