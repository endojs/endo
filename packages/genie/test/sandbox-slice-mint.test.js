// @ts-check

/**
 * Unit tests for `mintGenieSlice` — specifically the resolved-backend
 * consistency rules called out in
 * `TODO/62_genie_slice_resolved_backend_consistency.md`:
 *
 *   1. The factory's `make({ backend })` call receives the *resolved*
 *      backend (the concrete driver name selected by `listBackends()`)
 *      rather than the raw form value `'auto'`, so the spec, the
 *      operator-grep readiness log line, and the post-mint cross-check
 *      all agree on which driver runs the slice.
 *   2. `assertRootfsBackendCompatible` fires a second time *after*
 *      `'auto'` resolution.  The form-side check naming the agent
 *      short-circuits the bwrap-rejects-oci rule whenever the operator
 *      left `backend` at its default of `'auto'`; the slice-side check
 *      catches the `'auto'` -> `bwrap` resolution against an
 *      `oci:<ref>` rootfs and surfaces the same friendly form-side
 *      message instead of letting `factory.make` fail with the bwrap
 *      driver's lower-level error.
 *
 * The tests use a hand-rolled `SandboxFactory` stub rather than
 * spinning up `@endo/sandbox` because the cross-check fires *before*
 * `factory.make` is reached and we want the unit to run on platforms
 * without a backend installed (macOS, kernels lacking unprivileged
 * user namespaces, etc.).
 */

import '@endo/init/debug.js';

import process from 'node:process';

import test from 'ava';

import { makePromiseKit } from '@endo/promise-kit';

import { mintGenieSlice } from '../src/sandbox/slice.js';

/** @import { MountCap, SandboxFactory } from '@endo/sandbox/types.js' */

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

/**
 * Build a stub `SandboxFactory` whose `listBackends()` returns the
 * supplied probe records and whose `make(opts)` records every call and
 * returns a no-op handle.  The minted-slice handle's `dispose()` is a
 * no-op resolved promise so the cancellation-aware path
 * (`cancelledP.then(() => slice.dispose())`) does not blow up if the
 * caller wires one in.
 *
 * @param {Array<{ name: string; available: boolean; reason?: string }>} probes
 */
const makeSandboxFactoryStub = probes => {
  /** @type {Array<any>} */
  const makeCalls = [];
  const sliceHandle = harden({
    dispose: async () => {},
  });
  const factory = harden({
    listBackends: async () => harden(probes.map(p => harden({ ...p }))),
    /** @param {any} opts */
    make: async opts => {
      makeCalls.push(opts);
      return sliceHandle;
    },
  });
  return { factory, makeCalls, sliceHandle };
};

/**
 * Minimal Mount-cap stub for the workspace mount.  `mintGenieSlice`
 * never invokes the cap directly — it only forwards it through to the
 * factory's `make()` call inside the `MountSpec[]` — so a frozen
 * empty object is enough to exercise the cross-check path.
 */
const makeWorkspaceMountStub = () => harden({});

// ---------------------------------------------------------------------------
// Resolved-backend consistency
// ---------------------------------------------------------------------------

test('mintGenieSlice — passes the resolved backend to factory.make', async t => {
  const { factory, makeCalls } = makeSandboxFactoryStub([
    { name: 'bwrap', available: true },
  ]);
  const minted = await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'host-bind' }),
    parsedRootfs: harden({ kind: 'host-bind' }),
    rootfsLabel: 'host-bind',
    onLog: () => {},
  });
  t.is(minted.resolvedBackend, 'bwrap');
  t.is(makeCalls.length, 1);
  // The factory must see the *resolved* backend, not the raw 'auto'
  // form value, so the spec, the readiness log (which is already
  // computed off `resolvedBackend`), and the post-resolution
  // cross-check all agree on which driver runs the slice.
  t.is(makeCalls[0].backend, 'bwrap');
  t.is(
    minted.sliceLabel,
    'backend: bwrap, network: private, rootfs: host-bind',
  );
});

test('mintGenieSlice — auto -> bwrap with oci rootfs rejects with the form-side fix string', async t => {
  // Form-side check passed because `backend === 'auto'` is
  // bwrap-compatible by construction; only after probe / select
  // resolves `'auto'` -> `'bwrap'` does the incompatibility surface.
  // The slice-side cross-check must catch this and reject with the
  // same friendly message that names the agent and points at the fix
  // ("set backend to podman or pick a non-oci rootfs").
  const { factory, makeCalls } = makeSandboxFactoryStub([
    { name: 'bwrap', available: true },
    { name: 'podman', available: false, reason: 'podman not on PATH' },
  ]);
  await t.throwsAsync(
    () =>
      mintGenieSlice({
        sandboxFactory: /** @type {SandboxFactory} */ (
          /** @type {unknown} */ (factory)
        ),
        agentName: 'main-genie',
        workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
        workspaceDir: '/tmp/agent-workspace',
        backend: 'auto',
        network: 'private',
        rootfs: harden({ kind: 'oci', ref: 'docker.io/library/alpine:3.19' }),
        parsedRootfs: harden({
          kind: 'oci',
          ref: 'docker.io/library/alpine:3.19',
        }),
        rootfsLabel: 'oci:docker.io/library/alpine:3.19',
        onLog: () => {},
      }),
    {
      message:
        /agent "main-genie": rootfs "oci:docker\.io\/library\/alpine:3\.19" is incompatible with "backend: bwrap"; set "backend" to "podman" or pick a non-oci rootfs/,
    },
  );
  // The cross-check must fire *before* `factory.make` so the operator
  // never sees the bwrap driver's lower-level error.
  t.is(makeCalls.length, 0);
});

// ---------------------------------------------------------------------------
// `cancelledP` teardown — resolve and reject both trigger `slice.dispose()`
// ---------------------------------------------------------------------------

/**
 * Build a stub slice handle whose `dispose()` either resolves or
 * rejects, with a call counter and a recorded rejection reason.  Used
 * by the cancellation-teardown tests below to swap the no-op handle
 * `makeSandboxFactoryStub` returns by default with one we can inspect
 * for invocation count and one whose failure path exercises `onWarn`.
 *
 * @param {object} [opts]
 * @param {Error} [opts.disposeRejection]
 */
const makeInspectableSliceHandle = ({ disposeRejection } = {}) => {
  let disposeCount = 0;
  const handle = harden({
    dispose: async () => {
      disposeCount += 1;
      if (disposeRejection) throw disposeRejection;
    },
  });
  return { handle, getDisposeCount: () => disposeCount };
};

/**
 * Build a stub `SandboxFactory` whose `make()` returns the supplied
 * slice handle.  Shares its shape with `makeSandboxFactoryStub` but
 * lets the caller inject a specific handle so `dispose` can be
 * observed.
 *
 * @param {Array<{ name: string; available: boolean; reason?: string }>} probes
 * @param {any} sliceHandle
 */
const makeFactoryWithHandle = (probes, sliceHandle) => {
  /** @type {Array<any>} */
  const makeCalls = [];
  const factory = harden({
    listBackends: async () => harden(probes.map(p => harden({ ...p }))),
    /** @param {any} opts */
    make: async opts => {
      makeCalls.push(opts);
      return sliceHandle;
    },
  });
  return { factory, makeCalls };
};

/**
 * Install a temporary `unhandledRejection` listener for the duration
 * of the test.  Returns a getter for the captured reasons.  The
 * teardown removes the listener so it does not leak across the
 * file's tests.
 *
 * @param {import('ava').ExecutionContext} t
 */
const captureUnhandledRejections = t => {
  /** @type {unknown[]} */
  const reasons = [];
  /** @param {unknown} reason */
  const onUnhandled = reason => {
    reasons.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  t.teardown(() => {
    process.off('unhandledRejection', onUnhandled);
  });
  return () => reasons;
};

/**
 * Drain microtask turns until `predicate()` returns true, then drain a
 * few additional turns so any *extra* settle work (a buggy second
 * dispose, a late unhandled rejection) has a chance to surface before
 * the test's assertions run.
 *
 * The fixed `for (let i = 0; i < N; i += 1) await Promise.resolve()`
 * pattern that previously lived in these tests is timing-fragile:
 * `LOCKDOWN_HARDEN_TAMING=unsafe` (the `ava-endo-lockdown-unsafe.config.mjs`
 * scenario) lengthens the eventual-send round-trip by a handful of
 * microtask turns and the hard-coded N falls short.  Polling against
 * the observable signal plus a generous safety drain decouples the
 * test from that internal turn count without making the assertion any
 * less strict — the post-predicate `extraTurns` still pin "happens
 * exactly once".
 *
 * @param {() => boolean} predicate
 * @param {object} [opts]
 * @param {number} [opts.maxTurns]
 * @param {number} [opts.extraTurns]
 */
const drainMicrotasksUntil = async (
  predicate,
  { maxTurns = 64, extraTurns = 8 } = {},
) => {
  for (let i = 0; i < maxTurns; i += 1) {
    if (predicate()) break;
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  for (let i = 0; i < extraTurns; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

test('mintGenieSlice — cancelledP resolve path invokes slice.dispose()', async t => {
  // The happy path: the only current call site (`main.js`'s
  // `spawnAgent`) resolves the kit, so the resolve arm must remain
  // wired up to `E(slice).dispose()`.
  const { handle, getDisposeCount } = makeInspectableSliceHandle();
  const { factory } = makeFactoryWithHandle(
    [{ name: 'bwrap', available: true }],
    handle,
  );
  const { promise: cancelledP, resolve: cancel } = makePromiseKit();
  await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'host-bind' }),
    parsedRootfs: harden({ kind: 'host-bind' }),
    rootfsLabel: 'host-bind',
    cancelledP,
    onLog: () => {},
  });
  t.is(getDisposeCount(), 0);
  cancel(undefined);
  // Drain until dispose fires, then keep draining for a few more
  // microtask turns so a buggy duplicate dispose would still surface
  // before the assertion.  The exact turn count is internal to
  // eventual-send and shifts under `LOCKDOWN_HARDEN_TAMING=unsafe`;
  // polling decouples the test from it.
  await drainMicrotasksUntil(() => getDisposeCount() >= 1);
  t.is(getDisposeCount(), 1);
});

test('mintGenieSlice — cancelledP reject path invokes slice.dispose() without unhandledRejection', async t => {
  // The defense-in-depth path: a future caller that signals teardown
  // by rejecting the kit (e.g. "tear down because the worker is
  // unhealthy") must not leak the slice or trip the node-level
  // `unhandledRejection` warning.  Pin both:
  //   - `slice.dispose()` is invoked exactly once;
  //   - no rejection escapes onto the unhandled-rejection channel
  //     during the test window.
  // See `TODO/67_genie_slice_cancelled_rejection_handler.md`.
  const getUnhandled = captureUnhandledRejections(t);
  const { handle, getDisposeCount } = makeInspectableSliceHandle();
  const { factory } = makeFactoryWithHandle(
    [{ name: 'bwrap', available: true }],
    handle,
  );
  const { promise: cancelledP, reject } = makePromiseKit();
  await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'host-bind' }),
    parsedRootfs: harden({ kind: 'host-bind' }),
    rootfsLabel: 'host-bind',
    cancelledP,
    onLog: () => {},
  });
  t.is(getDisposeCount(), 0);
  reject(new Error('worker unhealthy'));
  // The reject arm fires on the next turn, `E(slice).dispose()`
  // round-trips through the eventual-send queue, and a tail `.catch`
  // settles after that.  Polling until dispose lands and then
  // continuing to drain for the safety-turn window catches both the
  // "exactly once" claim and any tail unhandled rejection without
  // hard-coding the round-trip turn count, which shifts under
  // `LOCKDOWN_HARDEN_TAMING=unsafe`.
  await drainMicrotasksUntil(() => getDisposeCount() >= 1);
  t.is(getDisposeCount(), 1);
  t.deepEqual(getUnhandled(), []);
});

test('mintGenieSlice — cancelledP reject path with dispose error still calls onWarn', async t => {
  // When the slice's own `dispose()` rejects on the reject arm, the
  // chained `.catch` must still hand the error to `onWarn` with the
  // existing `"slice dispose error: …"` prefix — identical surface
  // to the resolve path's failure handling.
  const getUnhandled = captureUnhandledRejections(t);
  const { handle } = makeInspectableSliceHandle({
    disposeRejection: new Error('bwrap exited badly'),
  });
  const { factory } = makeFactoryWithHandle(
    [{ name: 'bwrap', available: true }],
    handle,
  );
  /** @type {string[]} */
  const warnings = [];
  const { promise: cancelledP, reject } = makePromiseKit();
  await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'host-bind' }),
    parsedRootfs: harden({ kind: 'host-bind' }),
    rootfsLabel: 'host-bind',
    cancelledP,
    onLog: () => {},
    onWarn: msg => warnings.push(msg),
  });
  reject(new Error('worker unhealthy'));
  // Wait for the `.catch` handoff into `onWarn` — that is the
  // observable signal the dispose-failure path completed end to end.
  // Drain the safety-turn window after that so any duplicate warn or
  // tail unhandled rejection surfaces before the assertions.
  await drainMicrotasksUntil(() => warnings.length >= 1);
  t.deepEqual(warnings, ['slice dispose error: bwrap exited badly']);
  // The `.catch` consumed the dispose rejection — nothing escaped
  // onto the unhandled-rejection channel.
  t.deepEqual(getUnhandled(), []);
});

// ---------------------------------------------------------------------------
// `env` deep-harden at the slice boundary
// ---------------------------------------------------------------------------

test('mintGenieSlice — proxy-backed env getter is invoked exactly once and the proxy never reaches factory.make', async t => {
  // A `Proxy`-backed `env` with a counter in its getter is the
  // canonical TOCTOU shape under the central confinement claim:
  // without a defensive copy, the value read inside `mintGenieSlice`
  // and the value the driver eventually injects into the slice could
  // differ.  After deep-hardening on entry the getter must be invoked
  // exactly once (the shallow spread that copies own-enumerable
  // properties into the safe record) and the spec passed to
  // `factory.make` must carry the frozen record rather than the
  // proxy.  See `TODO/63_genie_slice_env_deep_harden.md`.
  const { factory, makeCalls } = makeSandboxFactoryStub([
    { name: 'bwrap', available: true },
  ]);
  const target = { FOO: 'bar' };
  let getCount = 0;
  const proxyEnv = new Proxy(target, {
    get(t_, k) {
      getCount += 1;
      return Reflect.get(t_, k);
    },
  });
  await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'host-bind' }),
    parsedRootfs: harden({ kind: 'host-bind' }),
    rootfsLabel: 'host-bind',
    env: /** @type {Record<string, string>} */ (
      /** @type {unknown} */ (proxyEnv)
    ),
    onLog: () => {},
  });
  // The shallow spread reads every own-enumerable property exactly
  // once.  Any additional reads (e.g. from `factory.make` or the
  // slice-spec hardening) would imply the proxy still flowed past
  // the boundary.
  t.is(getCount, 1);
  t.is(makeCalls.length, 1);
  // The proxy itself must never reach the factory; the spec must
  // carry the frozen safe record.
  t.not(makeCalls[0].env, proxyEnv);
  t.deepEqual({ ...makeCalls[0].env }, { FOO: 'bar' });
  t.true(Object.isFrozen(makeCalls[0].env));
});

test('mintGenieSlice — non-string env value is rejected with a friendly name-bearing error', async t => {
  // The factory's `M.interface()` guard already enforces string
  // values, but rejecting up front lets us name the offending key in
  // the error message so the operator sees the form-side fix string
  // before the slice-mint round-trip.
  const { factory, makeCalls } = makeSandboxFactoryStub([
    { name: 'bwrap', available: true },
  ]);
  await t.throwsAsync(
    () =>
      mintGenieSlice({
        sandboxFactory: /** @type {SandboxFactory} */ (
          /** @type {unknown} */ (factory)
        ),
        agentName: 'main-genie',
        workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
        workspaceDir: '/tmp/agent-workspace',
        backend: 'auto',
        network: 'private',
        rootfs: harden({ kind: 'host-bind' }),
        parsedRootfs: harden({ kind: 'host-bind' }),
        rootfsLabel: 'host-bind',
        env: /** @type {Record<string, string>} */ (
          /** @type {unknown} */ ({ FOO: 42 })
        ),
        onLog: () => {},
      }),
    {
      message:
        /agent "main-genie": env value for "FOO" must be a string, got "number"/,
    },
  );
  t.is(makeCalls.length, 0);
});

test('mintGenieSlice — auto -> podman with oci rootfs passes the cross-check', async t => {
  // When podman is available it sorts ahead of bwrap in the probe
  // list (or whichever order the factory reports), and `'auto'`
  // resolves to a backend the OCI rootfs *is* compatible with.  The
  // slice-side cross-check is a no-op for that combination and the
  // factory.make call must reach the stub.
  const { factory, makeCalls } = makeSandboxFactoryStub([
    { name: 'podman', available: true },
    { name: 'bwrap', available: true },
  ]);
  const minted = await mintGenieSlice({
    sandboxFactory: /** @type {SandboxFactory} */ (
      /** @type {unknown} */ (factory)
    ),
    agentName: 'main-genie',
    workspaceMount: /** @type {MountCap} */ (makeWorkspaceMountStub()),
    workspaceDir: '/tmp/agent-workspace',
    backend: 'auto',
    network: 'private',
    rootfs: harden({ kind: 'oci', ref: 'docker.io/library/alpine:3.19' }),
    parsedRootfs: harden({
      kind: 'oci',
      ref: 'docker.io/library/alpine:3.19',
    }),
    rootfsLabel: 'oci:docker.io/library/alpine:3.19',
    onLog: () => {},
  });
  t.is(minted.resolvedBackend, 'podman');
  t.is(makeCalls.length, 1);
  t.is(makeCalls[0].backend, 'podman');
});
