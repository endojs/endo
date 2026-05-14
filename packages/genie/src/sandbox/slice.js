// @ts-check

/**
 * Genie sandbox-slice helper — the boundary between "I have a workspace
 * `MountCap` and a `SandboxFactory`" and "now mint a confined slice for
 * me".
 *
 * Both the daemon-hosted genie (`main.js`) and the dev-repl harness
 * (`dev-repl.js`, see `TODO/54_genie_dev_repl_sandbox.md`) consume this
 * module.  The daemon adds the rest of the wiring on top — pet-name
 * resolution, agent-guest bookkeeping, heartbeat ticker, cancellation
 * kit — but the slice-specific portion (probe → validate backend →
 * call `factory.make` → register dispose → wrap a sandbox spawner)
 * lives here.
 *
 * The form-side parse helpers (`parseRootfsValue`,
 * `assertRootfsBackendCompatible`) and their supporting constants live
 * alongside `mintGenieSlice` so a single import from the dev-repl
 * covers the whole slice-config boundary; `main.js` re-exports them to
 * preserve the public surface the genie tests grew up consuming.
 */

import { makeError, q, X } from '@endo/errors';
import { E } from '@endo/eventual-send';

import { makeSandboxSpawner } from '../tools/sandbox-spawner.js';

/** @import { SandboxHandleLike } from '../tools/sandbox-spawner.js' */
/** @import { Spawner } from '../tools/spawner.js' */
/** @import { BackendProbe, BackendSelector, MountCap, MountSpec, NetworkProfile, RootfsSpec, SandboxFactory, SandboxHandle } from '@endo/sandbox/types.js' */

/**
 * Method names a `MountCap` must expose for the genie's downstream
 * consumers — `spawnAgent`'s workspace and rootfs pet-name branches in
 * `main.js`, plus `initWorkspaceMount` and the slice-mint call.  This
 * is the subset of the daemon's `MountInterface` the genie actually
 * drives directly; sibling methods like `lookup` / `remove` / `move`
 * are exercised through `vfs-mount.js` but not by `spawnAgent` itself,
 * so they are not gated here.
 */
export const MOUNT_REQUIRED_METHODS = harden([
  'readText',
  'writeText',
  'makeDirectory',
  'has',
  'list',
]);

/**
 * Verify that `cap` exposes the {@link MOUNT_REQUIRED_METHODS} surface
 * and return it narrowed to `MountCap` for the caller to chain.
 *
 * **This is a shape gate, not an identity gate.**  Its job is to
 * produce a friendly, agent-named error when the operator pet-names
 * something that isn't a Mount (e.g. a guest, a value blob, a typo).
 * It does **not** authenticate the cap as daemon-minted (or
 * local-minted on the dev-repl side) — any `makeExo` / `Far` exo with
 * the right method names satisfies it.
 *
 * The *identity* gate fires later, when `spawnAgent` calls
 * `E(hostAgent).provideHostPath(cap)` (daemon path) or the dev-repl
 * calls `E(powers).provideHostPath(cap)` (`local-powers.js` path).
 * The daemon's `EndoHost.provideHostPath` consults its mount-formula
 * registry (`packages/daemon/src/host.js` ~line 302) and rejects
 * strangers with `not a daemon-minted mount`; the local powers
 * consult a `WeakMap` and reject with `not a local-minted mount`.
 * A spoofed exo that passes this shape gate is therefore rejected by
 * the identity gate before any host path crosses the slice boundary
 * — the layering is "friendly shape error first, authoritative
 * identity error second", and neither stands alone.
 *
 * @param {unknown} cap
 * @param {object} ctx
 * @param {string} ctx.agentName
 * @param {'workspace' | 'rootfs'} ctx.role
 * @param {string} ctx.petName
 * @returns {Promise<MountCap>}
 */
export const assertIsMountCap = async (cap, { agentName, role, petName }) => {
  /** @type {string[]} */
  const methods = /** @type {string[]} */ (
    // eslint-disable-next-line no-underscore-dangle
    await E(/** @type {any} */ (cap)).__getMethodNames__()
  );
  const missing = MOUNT_REQUIRED_METHODS.filter(m => !methods.includes(m));
  if (missing.length > 0) {
    if (role === 'workspace') {
      throw makeError(
        X`agent ${q(agentName)}: workspace pet name ${q(petName)} does not refer to a Mount cap (missing methods: ${q(missing.join(', '))}; available: ${q(methods.join(', '))})`,
      );
    }
    throw makeError(
      X`agent ${q(agentName)}: rootfs pet name ${q(petName)} does not refer to a Mount cap (missing methods: ${q(missing.join(', '))}; available: ${q(methods.join(', '))})`,
    );
  }
  return /** @type {MountCap} */ (cap);
};
harden(assertIsMountCap);

/**
 * Slice-internal mount point for the workspace.  Mirrors the path
 * documented in `setup.js` and the genie README; agents see the
 * workspace under this fixed path inside the slice regardless of the
 * host directory it maps from.
 */
export const SLICE_WORKSPACE_PATH = '/workspace';

/**
 * Allowed sandbox network profiles.  Mirrors `NetworkProfileShape` in
 * `packages/sandbox/src/interfaces.js` so the form-side check can
 * reject unknown profiles up front rather than waiting for the
 * factory's interface guard to refuse them mid-mint.
 */
export const ALLOWED_NETWORK_PROFILES = harden([
  'none',
  'private',
  'host-loopback',
  'host-lan',
  'host-net',
]);

/**
 * @param {string} network
 * @returns {network is NetworkProfile}
 */
export const isAllowedNetworkProfile = network =>
  ALLOWED_NETWORK_PROFILES.includes(network);
harden(isAllowedNetworkProfile);

/** Default network profile for genie slices. */
export const DEFAULT_NETWORK_PROFILE = 'private';

/** Default backend selector for genie slices. */
export const DEFAULT_BACKEND = 'auto';

/**
 * Allowed sandbox backend selectors.  Mirrors `BackendSelectorShape`
 * in `packages/sandbox/src/interfaces.js` (`'auto' | BackendName`) so
 * the form-side check can reject typos up front rather than waiting
 * for the factory's interface guard to refuse them mid-mint.
 */
export const ALLOWED_BACKENDS = harden([
  'auto',
  'bwrap',
  'podman',
  'lima',
  'containerization',
  'wsl',
]);

/**
 * @param {string} backend
 * @returns {backend is BackendSelector}
 */
export const isAllowedBackend = backend => ALLOWED_BACKENDS.includes(backend);
harden(isAllowedBackend);

/**
 * Allowed rootfs kind keywords that the form accepts directly (no
 * payload).  Mirrors the keyword-only arms of `RootfsSpec` in
 * `packages/sandbox/src/types.d.ts` ~line 143.  The `oci:<ref>` shape
 * carries a payload and is parsed separately by `parseRootfsValue`;
 * the `MountCap` (pet-name) shape resolves through the agent guest
 * inside the daemon's `spawnAgent` after `parseRootfsValue` reports
 * the `'pet-name'` marker (see `TODO/52_genie_rootfs_mount_cap.md`).
 */
export const ALLOWED_ROOTFS_KINDS = harden(['host-bind', 'minimal']);

/** Default rootfs kind for genie slices. */
export const DEFAULT_ROOTFS_KIND = 'host-bind';

/**
 * @param {string} kind
 * @returns {kind is 'host-bind' | 'minimal'}
 */
export const isAllowedRootfsKind = kind => ALLOWED_ROOTFS_KINDS.includes(kind);
harden(isAllowedRootfsKind);

/**
 * @typedef {(
 *   | { kind: 'host-bind' }
 *   | { kind: 'minimal' }
 *   | { kind: 'oci', ref: string }
 *   | { kind: 'pet-name', petName: string }
 * )} ParsedRootfsValue
 *
 * The synchronous form-side parse result.  The first three arms map
 * directly onto `RootfsSpec` keyword shapes; the `'pet-name'` arm is
 * a placeholder marker that the daemon's `spawnAgent` resolves
 * against the agent guest's namespace and validates against
 * `MountInterface` before passing the looked-up cap into
 * `E(sandboxFactory).make(...)` as the `RootfsSpec` `MountCap` arm.
 */

/**
 * Parse a `rootfs` form value into a {@link ParsedRootfsValue}.
 *
 * Accepts:
 *   - `'host-bind'` -> `{ kind: 'host-bind' }`
 *   - `'minimal'`   -> `{ kind: 'minimal' }`
 *   - `'oci:<ref>'` -> `{ kind: 'oci', ref }` (with `ref` non-empty).
 *   - any other non-empty string -> `{ kind: 'pet-name', petName }`,
 *     a placeholder marker that the daemon's `spawnAgent` resolves
 *     through `E(agentGuest).lookup(petName)` and validates against
 *     `MountInterface` (see `TODO/52_genie_rootfs_mount_cap.md`).
 *
 * Throws a structured error naming the agent for non-string inputs,
 * the empty string, and an `'oci:'` prefix with no reference.  The
 * helper itself stays synchronous; the pet-name -> Mount-cap
 * resolution is the caller's responsibility because it requires an
 * eventual send into the agent guest's namespace.
 *
 * @param {string} value
 * @param {object} options
 * @param {string} options.agentName
 * @returns {ParsedRootfsValue}
 */
export const parseRootfsValue = (value, { agentName }) => {
  if (typeof value !== 'string') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs value must be a string; got ${q(typeof value)}`,
    );
  }
  if (value === '') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs value is empty; expected one of ${q(ALLOWED_ROOTFS_KINDS.join(', '))}, ${q('oci:<ref>')}, or a pet name introduced into the agent guest's namespace`,
    );
  }
  if (value === 'host-bind') {
    return harden({ kind: 'host-bind' });
  }
  if (value === 'minimal') {
    return harden({ kind: 'minimal' });
  }
  if (value.startsWith('oci:')) {
    const ref = value.slice('oci:'.length);
    if (ref === '') {
      throw makeError(
        X`agent ${q(agentName)}: rootfs ${q(value)} is missing the OCI image reference; expected ${q('oci:<ref>')} (e.g. ${q('oci:docker.io/library/alpine:3.19')})`,
      );
    }
    return harden({ kind: 'oci', ref });
  }
  // Fall through to the pet-name branch.  The form has no legacy
  // host-path arm for `rootfs` (unlike `workspace`), so anything that
  // isn't a recognised keyword or `oci:<ref>` is treated as a pet
  // name pointing at a Mount cap already introduced into the agent
  // guest's namespace.  The daemon's `spawnAgent` resolves and
  // validates the cap; a typo surfaces there as a structured error
  // rather than throwing here — mirroring the workspace pet-name
  // branch's discipline.
  return harden({ kind: 'pet-name', petName: value });
};
harden(parseRootfsValue);

/**
 * Cross-validate a {@link ParsedRootfsValue} against the resolved
 * backend selector.  The bwrap driver rejects `oci:` rootfs
 * internally with a structured error (see
 * `packages/sandbox/src/drivers/bwrap.js` ~lines 318-326 and
 * 544-552); front-running that check here surfaces a friendlier
 * message that names the agent and points at the fix before we ever
 * reach `E(sandboxFactory).make(...)`.
 *
 * The keyword shapes (`host-bind`, `minimal`) and the `'pet-name'`
 * marker are compatible with both `bwrap` and `podman` and pass
 * through unchanged; only `oci` + `bwrap` is rejected.
 *
 * @param {ParsedRootfsValue} rootfs
 * @param {string} backend
 * @param {object} options
 * @param {string} options.agentName
 */
export const assertRootfsBackendCompatible = (
  rootfs,
  backend,
  { agentName },
) => {
  if (rootfs.kind === 'oci' && backend === 'bwrap') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs ${q(`oci:${rootfs.ref}`)} is incompatible with ${q('backend: bwrap')}; set ${q('backend')} to ${q('podman')} or pick a non-oci rootfs`,
    );
  }
};
harden(assertRootfsBackendCompatible);

/**
 * @typedef {object} MintGenieSliceOptions
 * @property {SandboxFactory} sandboxFactory - The sandbox factory
 *   capability minted by `setup.js` (or by the dev-repl's local
 *   harness).  `mintGenieSlice` calls `listBackends()` and `make()`
 *   on it via eventual send.
 * @property {string} agentName - Display name for log lines and
 *   structured errors.  The daemon passes the agent's pet name
 *   (`'main-genie'`, etc.); the dev-repl passes `'dev-repl'`.
 * @property {MountCap} workspaceMount - Mount cap rooted at the
 *   workspace.  Mounted into the slice at {@link SLICE_WORKSPACE_PATH}
 *   so the daemon-side and slice-side views land on the same bytes.
 * @property {string} workspaceDir - Host filesystem path that
 *   `workspaceMount` resolves to.  Used only in the readiness log
 *   line so operators can grep for the host path; the slice itself
 *   never sees it.
 * @property {string} [backend] - Sandbox backend selector.
 *   Defaults to {@link DEFAULT_BACKEND}.
 * @property {string} [network] - Sandbox network profile.
 *   Defaults to {@link DEFAULT_NETWORK_PROFILE}.
 * @property {RootfsSpec} rootfs - Resolved `RootfsSpec` payload
 *   ready to pass into `factory.make({ rootfs })`.  The caller is
 *   responsible for resolving the `'pet-name'` marker into a
 *   `MountCap` before invoking `mintGenieSlice` (the daemon does
 *   this via `E(agentGuest).lookup(...)`).
 * @property {ParsedRootfsValue} parsedRootfs - The synchronous
 *   form-side parse of the operator's `rootfs` value.  Threaded
 *   alongside the resolved `rootfs` so `mintGenieSlice` can re-run
 *   `assertRootfsBackendCompatible` against the *resolved* backend
 *   (after `'auto'` selection) — the form-side check naming the
 *   agent fires before mint, but it short-circuits the
 *   bwrap-rejects-oci rule whenever `backend === 'auto'`.  See
 *   `TODO/62_genie_slice_resolved_backend_consistency.md`.
 * @property {string} rootfsLabel - Human-readable rootfs label for
 *   the readiness log line (e.g. `'host-bind'`, `'oci:alpine:3.19'`,
 *   `'pet-name:rootfs-mount'`).  Computed by the caller from the
 *   parsed marker because, after pet-name resolution, the resolved
 *   `RootfsSpec` is a Mount cap with no `kind` to discriminate on.
 * @property {Record<string, string>} [env] - Environment variables to
 *   inject into the slice.  Defaults to `{}`.
 * @property {Promise<unknown>} [cancelledP] - Optional cancellation
 *   signal.  When provided, `slice.dispose()` is registered to fire
 *   on **either** resolution **or** rejection of the promise so the
 *   bwrap subprocess and scratch upper layer are reclaimed promptly
 *   even before the GC sweep.  The reject arm is wired explicitly
 *   so a future caller that uses `reject(reason)` to signal "tear
 *   down because the worker is unhealthy" does not leak the slice
 *   or trip the node-level `unhandledRejection` warning; today the
 *   only caller (`main.js`'s `spawnAgent`) resolves the kit on the
 *   happy path.  When `cancelledP` is omitted, the caller is
 *   expected to call `slice.dispose()` itself (the dev-repl path,
 *   where teardown is REPL-driven — see
 *   `TODO/54_genie_dev_repl_sandbox.md`).
 * @property {(msg: string) => void} [onLog] - Optional log writer for
 *   info-level messages (slice mint announcement).  Defaults to
 *   `console.log`.  The daemon path passes
 *   `(msg) => console.log('[genie:agentName] ' + msg)`; the
 *   dev-repl passes a dim-formatted writer.
 * @property {(msg: string) => void} [onWarn] - Optional log writer for
 *   warning-level messages (slice dispose errors).  Defaults to
 *   `(msg) => console.warn('[genie:agentName] ' + msg)` so the
 *   daemon's existing log surface is preserved verbatim.
 */

/**
 * @typedef {object} MintedGenieSlice
 * @property {SandboxHandle} slice - The minted sandbox handle.
 * @property {Spawner} spawner - A slice-backed spawner that routes
 *   `bash` / `exec` / `git` tools through the slice.
 * @property {string} resolvedBackend - The backend that ended up
 *   running the slice.  Equal to the `backend` option except when
 *   `backend === 'auto'`, in which case it is the first available
 *   driver reported by `listBackends()`.
 * @property {string} sliceLabel - The
 *   `"backend: …, network: …, rootfs: …"` string the daemon uses in
 *   its readiness announcement; both callers can reuse it for
 *   diagnostics.
 */

/**
 * Probe sandbox backends, validate the requested selector, mint a
 * confined slice via `E(sandboxFactory).make(...)`, register slice
 * teardown (when a `cancelledP` is supplied), and wrap the handle in
 * a `makeSandboxSpawner` adapter ready to feed into `buildGenieTools`.
 *
 * This is a no-functional-change refactor of the slice-mint sequence
 * that previously lived inline in `main.js`'s `spawnAgent` (~lines
 * 1399-1481).  Per-agent log prefixes (`[genie:agentName]`) move
 * into the {@link MintGenieSliceOptions.onLog} callback so the
 * dev-repl harness can format them dimly without the daemon's bracket
 * notation.
 *
 * The rootfs/backend cross-check (`assertRootfsBackendCompatible`)
 * fires twice on purpose, and the duplication is intentional — please
 * do not dedupe one of the call sites away:
 *
 * - The caller (`main.js` / `dev-repl.js`) runs it on the raw form
 *   value *before* mint so the operator sees an error that names the
 *   agent at the form boundary.  When `backend === 'auto'` that
 *   check short-circuits the bwrap-rejects-oci rule because
 *   `'auto'` is bwrap-compatible.
 * - This helper re-runs it on `resolvedBackend` *after* probe /
 *   select so an `'auto'` resolution that lands on `bwrap` with an
 *   `oci:<ref>` rootfs is rejected with the same friendly message
 *   instead of falling through into `factory.make` and surfacing
 *   the bwrap driver's lower-level error.
 *
 * @param {MintGenieSliceOptions} options
 * @returns {Promise<MintedGenieSlice>}
 */
export const mintGenieSlice = async ({
  sandboxFactory,
  agentName,
  workspaceMount,
  workspaceDir,
  backend = DEFAULT_BACKEND,
  network = DEFAULT_NETWORK_PROFILE,
  rootfs,
  parsedRootfs,
  rootfsLabel,
  env = {},
  cancelledP,
  onLog = console.log,
  onWarn = msg => console.warn(`[genie:${agentName}] ${msg}`),
}) => {
  // Deep-harden the caller's `env` at the boundary.  The shallow
  // spread reads every own enumerable property of the supplied object
  // exactly once, defeating a `Proxy`-backed `env` whose per-access
  // getter could otherwise differentiate the value we read here from
  // the value the driver eventually injects into the slice — a small
  // but real time-of-check / time-of-use seam under the central
  // confinement claim.  The `__proto__: null` and `harden` lock the
  // shape so no prototype-chain or property drift can re-open the
  // gap after entry.  See `TODO/63_genie_slice_env_deep_harden.md`.
  const safeEnv = harden({ ...env });
  for (const [key, value] of Object.entries(safeEnv)) {
    if (typeof value !== 'string') {
      throw makeError(
        X`agent ${q(agentName)}: env value for ${q(key)} must be a string, got ${q(typeof value)}`,
      );
    }
  }

  /** @type {MountSpec[]} */
  const mounts = [
    {
      cap: workspaceMount,
      innerPath: SLICE_WORKSPACE_PATH,
      mode: 'rw',
    },
  ];

  // Probe before minting so the operator sees the underlying
  // failure ("bwrap not on PATH", "kernel lacks user namespaces")
  // rather than a generic make() error.
  /** @type {BackendProbe[]} */
  const probes = await E(sandboxFactory).listBackends();
  const available = probes.filter(p => p.available);
  if (available.length === 0) {
    const reasonReport = probes
      .map(p => `${p.name}: ${p.reason || 'unavailable'}`)
      .join('; ');
    throw makeError(
      X`agent ${q(agentName)}: no sandbox backends available; refusing to start (operator must install a backend such as bubblewrap): ${q(reasonReport)}`,
    );
  }
  let resolvedBackend = backend;
  if (backend !== 'auto') {
    const probe = probes.find(p => p.name === backend);
    if (probe === undefined || !probe.available) {
      const reason =
        probe?.reason || `driver ${backend} not registered with factory`;
      throw makeError(
        X`agent ${q(agentName)}: sandbox backend ${q(backend)} unavailable; refusing to start: ${q(reason)}`,
      );
    }
  } else {
    resolvedBackend = available[0].name;
  }

  // Re-run the rootfs/backend cross-check against the *resolved*
  // backend.  The caller already ran the check against the raw form
  // value before invoking us, but that pass short-circuits the
  // bwrap-rejects-oci rule whenever `backend === 'auto'` (because
  // `'auto'` is bwrap-compatible by construction).  This second pass
  // catches the `'auto'` -> `bwrap` resolution with an `oci:<ref>`
  // rootfs and surfaces the same friendly form-side message instead
  // of letting `factory.make` fail with the bwrap driver's lower-
  // level error.  See `TODO/62_genie_slice_resolved_backend_consistency.md`.
  assertRootfsBackendCompatible(parsedRootfs, resolvedBackend, { agentName });

  // The factory's `M.interface()` guard validates the profile / backend
  // names; here we narrow the loose `string` shape from
  // `MintGenieSliceOptions` to the exact union the spec expects.  Naming
  // the locals differently from the spec keys keeps `object-shorthand`
  // happy without giving up the cast.  The selector passed to the
  // factory is the *resolved* backend so the spec, the log line
  // (computed off `resolvedBackend` below), and the post-resolution
  // cross-check above all agree on which driver runs the slice.
  const networkProfile = /** @type {NetworkProfile} */ (network);
  const backendSelector = /** @type {BackendSelector} */ (resolvedBackend);

  /** @type {SandboxHandle} */
  let slice;
  try {
    slice = await E(sandboxFactory).make(
      harden({
        rootfs,
        mounts,
        network: networkProfile,
        env: safeEnv,
        cwd: SLICE_WORKSPACE_PATH,
        backend: backendSelector,
      }),
    );
  } catch (err) {
    const message = /** @type {Error} */ (err).message || String(err);
    throw makeError(
      X`agent ${q(agentName)}: failed to mint sandbox slice (backend=${q(backend)}, network=${q(network)}): ${q(message)}`,
    );
  }

  // Tear down the slice promptly on cancellation so the bwrap
  // subprocess and scratch upper layer get reclaimed before the
  // GC sweep.  Closure capture pins the handle for the agent's
  // lifetime; explicit dispose() shortens the recovery window
  // when the agent exits cleanly.  When `cancelledP` is omitted,
  // the caller is expected to call `slice.dispose()` itself.
  //
  // The two-arm `.then` wires both the resolve and reject paths to
  // the same teardown: a future caller that uses `reject(reason)`
  // to signal "tear down because the worker is unhealthy" must not
  // leak the slice or trip the node-level `unhandledRejection`
  // warning.  Today the only call site (`main.js`'s `spawnAgent`)
  // exclusively resolves the kit, so the reject arm is dormant
  // defense-in-depth — but it is cheap, the intent is documented
  // on `MintGenieSliceOptions.cancelledP`, and the test suite pins
  // the behaviour so a regression here would surface as a leaked
  // slice in CI rather than silently in production.
  if (cancelledP !== undefined) {
    cancelledP
      .then(
        () => E(slice).dispose(),
        () => E(slice).dispose(),
      )
      .catch(disposeErr => {
        const message =
          /** @type {Error} */ (disposeErr).message || String(disposeErr);
        onWarn(`slice dispose error: ${message}`);
      });
  }

  onLog(
    `Sandbox slice minted (backend: ${resolvedBackend}, network: ${network}, mount: ${SLICE_WORKSPACE_PATH} <- ${workspaceDir}).`,
  );

  // `SandboxHandle` is a `FarRef`, so `makeSandboxSpawner` consumes
  // it directly: every method is reached via `E(handle).foo()` inside
  // the adapter, which transparently unwraps the FarRef.  The cast
  // narrows the FarRef brand to the structural `SandboxHandleLike`
  // the spawner declares — see the JSDoc on `SandboxHandleLike` for
  // why a real `FarRef<SandboxHandle>` satisfies that shape.
  const spawner = makeSandboxSpawner({
    handle: /** @type {SandboxHandleLike} */ (slice),
  });

  const sliceLabel = `backend: ${resolvedBackend}, network: ${network}, rootfs: ${rootfsLabel}`;

  return harden({ slice, spawner, resolvedBackend, sliceLabel });
};
harden(mintGenieSlice);
