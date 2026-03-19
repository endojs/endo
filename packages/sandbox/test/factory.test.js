// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { matches } from '@endo/patterns';

import { makeSandboxFactory } from '../src/factory.js';
import {
  BackendProbeShape,
  NetworkProfileShape,
  SandboxFactoryInterface,
} from '../src/interfaces.js';

const stubScratchProvider = harden({
  provideScratchMount: async () => {
    throw new Error('scratchProvider not used in Phase 0');
  },
});

test('listBackends returns an empty array when no drivers are registered', async t => {
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  const backends = await E(factory).listBackends();
  t.deepEqual(backends, [], 'no drivers ⇒ empty backend list');
  t.true(Array.isArray(backends));
});

test('make() throws a structured "no backend available" error in Phase 0', async t => {
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  await t.throwsAsync(
    () =>
      E(factory).make(
        harden({
          rootfs: { kind: 'host-bind' },
          network: 'none',
        }),
      ),
    { message: /no backend available/ },
    'Phase 0 stub rejects make()',
  );
});

test('make() reports the requested backend selector in its error', async t => {
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  await t.throwsAsync(
    () =>
      E(factory).make(
        harden({
          rootfs: { kind: 'host-bind' },
          backend: 'bwrap',
        }),
      ),
    { message: /no backend available.*bwrap/ },
    'unknown backend names round-trip into the error message',
  );
});

test('listBackends reports a registered driver as available', async t => {
  const stubDriver = harden({
    name: /** @type {const} */ ('bwrap'),
    probe: async () => harden({ available: true, version: 'stub-1.0' }),
    prepareSlice: async () => {
      throw new Error('not implemented');
    },
    spawn: async () => {
      throw new Error('not implemented');
    },
    teardown: async () => {
      throw new Error('not implemented');
    },
  });

  const factory = makeSandboxFactory({
    drivers: harden([stubDriver]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  const backends = await E(factory).listBackends();
  t.is(backends.length, 1);
  t.deepEqual(backends[0], {
    name: 'bwrap',
    available: true,
    version: 'stub-1.0',
  });
  t.true(
    matches(backends[0], BackendProbeShape),
    'probe shape matches BackendProbeShape',
  );
});

test('listBackends catches driver probe failures', async t => {
  const flakyDriver = harden({
    name: /** @type {const} */ ('podman'),
    probe: async () => {
      throw new Error('podman not on PATH');
    },
    prepareSlice: async () => {
      throw new Error('not implemented');
    },
    spawn: async () => {
      throw new Error('not implemented');
    },
    teardown: async () => {
      throw new Error('not implemented');
    },
  });

  const factory = makeSandboxFactory({
    drivers: harden([flakyDriver]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  const [probe] = await E(factory).listBackends();
  t.is(probe.name, 'podman');
  t.false(probe.available);
  t.regex(probe.reason ?? '', /podman not on PATH/);
});

test('SandboxFactory interface advertises the expected method names', t => {
  // M.interface() exposes the method guards via the returned interface
  // value; CapTP introspection is the consumer surface, but the guard
  // value itself records the configured method names.
  const guard = SandboxFactoryInterface;
  t.truthy(guard, 'interface guard is defined');
  // The guard is an InterfaceGuard with a known shape — at minimum we
  // can confirm the value is hardened (M.interface returns a hardened
  // pattern) so callers can pass it across CapTP.
  t.true(Object.isFrozen(guard));
});

test('__getMethodNames__() round-trips the documented capability surface', async t => {
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  // CapTP introspection: the same surface remote callers see.
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (factory)).__getMethodNames__();
  // makeExo always adds __getMethodNames__ and __getInterfaceGuard__.
  // Filter those out before comparing the user-visible surface.
  const userMethods = [...methods].filter(m => !m.startsWith('__')).sort();
  t.deepEqual(
    userMethods,
    [
      'forgetPersistent',
      'help',
      'listBackends',
      'listPersistent',
      'make',
      'makePersistent',
    ],
    'factory advertises help / listBackends / make + persistent-slice surface',
  );
});

test('NetworkProfileShape accepts the documented profiles and rejects others', t => {
  for (const profile of [
    'none',
    'private',
    'host-loopback',
    'host-lan',
    'host-net',
  ]) {
    t.true(
      matches(profile, NetworkProfileShape),
      `${profile} matches NetworkProfileShape`,
    );
  }
  t.false(matches('host-internet', NetworkProfileShape));
  t.false(matches('', NetworkProfileShape));
});

test('factory.help() returns descriptive text', async t => {
  const factory = makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: /** @type {any} */ (stubScratchProvider),
  });

  const overview = await E(factory).help();
  t.regex(overview, /SandboxFactory/);
  const listHelp = await E(factory).help('listBackends');
  t.regex(listHelp, /listBackends/);
  const unknown = await E(factory).help('nonexistent');
  t.regex(unknown, /No documentation/);
});
