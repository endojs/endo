// @ts-check

/* global process */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import url from 'node:url';

import {
  start,
  stop,
  purge,
  makeEndoClient,
} from '@endo/daemon';

import { makeSandboxFactory } from '../src/factory.js';

/**
 * Smoke test for the `make-unconfined` registration shape.
 *
 * This drives the plugin's entry point through the same surface a
 * daemon would: `await import(agentURL)`, then `await module.make(powers)`.
 * The returned `SandboxFactory` is exercised through CapTP introspection
 * (`__getMethodNames__()`) and the documented Phase 0 contract
 * (`listBackends()` returning `[]`).
 *
 * A separate `daemon-shipped provideHostPath` case spins up a real
 * `@endo/daemon` and verifies that the host's `provideHostPath` method
 * is wired correctly: `provideMount(path)` → grant the resulting Mount
 * cap to a sandbox factory whose `scratchProvider` is the EndoHost →
 * the factory's `resolveHostPath` round-trips the cap back to the
 * original host filesystem path.  This is the daemon-side companion to
 * the stub `provideHostPath` used by the backend-agnostic factory
 * tests in `bwrap.test.js` / `podman.test.js`.
 */

const stubScratchProvider = harden({
  provideScratchMount: async () => {
    throw new Error('scratchProvider not used in Phase 0');
  },
});

test('agent.js make() loads and returns a factory matching the documented shape', async t => {
  const agentModule = await import('../src/agent.js');
  t.is(typeof agentModule.make, 'function', 'agent.js exports make()');

  const factory = await agentModule.make(
    /** @type {any} */ (stubScratchProvider),
    null,
    {},
  );
  t.truthy(factory, 'make() returns a factory');
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (factory)).__getMethodNames__();
  t.true(
    [...methods].includes('listBackends'),
    'CapTP introspection sees listBackends',
  );
  t.true([...methods].includes('make'), 'CapTP introspection sees make');
  t.true([...methods].includes('help'), 'CapTP introspection sees help');
});

test('listBackends() round-trips the registered backends', async t => {
  const agentModule = await import('../src/agent.js');
  const factory = await agentModule.make(
    /** @type {any} */ (stubScratchProvider),
    null,
    {},
  );
  const backends = await E(factory).listBackends();
  // Phase 1 registers the bwrap driver. Whether bwrap is *available*
  // depends on the host; the registration itself is what we assert.
  t.true(Array.isArray(backends));
  const names = backends.map(b => b.name);
  t.true(names.includes('bwrap'), 'bwrap driver is registered');
});

test('agent.js handles missing options gracefully', async t => {
  const agentModule = await import('../src/agent.js');
  // make-unconfined may invoke make(powers, context) without an options
  // argument; the agent must default `options` cleanly.
  const factory = await agentModule.make(
    /** @type {any} */ (stubScratchProvider),
    null,
  );
  const backends = await E(factory).listBackends();
  t.true(Array.isArray(backends));
  t.true(
    backends.map(b => b.name).includes('bwrap'),
    'bwrap driver is registered without an options argument',
  );
});
