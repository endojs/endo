// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';

/**
 * Smoke test for the `make-unconfined` registration shape.
 *
 * This drives the plugin's entry point through the same surface a
 * daemon would: `await import(agentURL)`, then `await module.make(powers)`.
 * The returned `SandboxFactory` is exercised through CapTP introspection
 * (`__getMethodNames__()`) and the documented Phase 0 contract
 * (`listBackends()` returning `[]`).
 *
 * A full end-to-end test that spins up a real daemon and uses
 * `E(host).makeUnconfined(...)` is deferred to Phase 1, where the bwrap
 * driver gives `listBackends()` a non-trivial result to round-trip.
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
