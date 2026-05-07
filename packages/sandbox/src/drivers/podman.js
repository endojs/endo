// @ts-check

/* global Buffer, process, setTimeout, clearTimeout */

import { makeError, q, X } from '@endo/errors';

import { makeCgroup2Probe } from '../limits.js';
import { DEFAULT_PATH } from './path.js';

/** @import { SandboxDriver, SliceSpec, SpawnOpts, DriverProcess, BackendProbe, BackendProbeDetails } from '../types.js' */

/**
 * `SandboxDriver` for rootless `podman` on Linux.
 *
 * Phase 2 driver.  Translates a fully-resolved `SliceSpec` (host paths
 * only, no Endo capabilities) into a long-running container that hosts
 * subsequent `spawn` calls via `podman exec`.  The driver is stateless
 * except for the per-slice context returned from `prepareSlice`, which
 * carries the container name, the live exec children, and the
 * runtime-feature report the factory weaves into `slice.help()`.
 *
 * Lifecycle:
 *   1. `prepareSlice` runs `podman pull` (if `rootfs.kind === 'oci'`
 *      and the image is missing), `podman create`, and `podman start`.
 *      The container's PID 1 is `sleep infinity` so the namespace
 *      stays alive across multiple `exec` calls.
 *   2. `spawn` runs `podman exec -i <name> <argv...>` and pipes stdio
 *      back through the same reader/writer adapters the bwrap driver
 *      uses.
 *   3. `teardown` runs `podman stop --time 5 <name>` then
 *      `podman rm <name>`.
 *
 * Boot-time GC: on first `probe()`, the driver sweeps containers whose
 * names start with `ENDO_SANDBOX_PREFIX` and removes them, on the
 * assumption that any survivor is an orphan from a daemon that exited
 * uncleanly.  Tests can disable the sweep by passing `reapOrphans:
 * false` to the constructor.
 */

/**
 * Container-name prefix for every slice this driver mints.  Stable
 * across daemon restarts so the boot-time orphan sweep can match
 * leftover containers from a previous run.  Also exported for tests.
 */
export const ENDO_SANDBOX_PREFIX = 'endo-sandbox-';
harden(ENDO_SANDBOX_PREFIX);

const DEFAULT_KILL_GRACE_MS = 5_000;
const DEFAULT_STOP_GRACE_S = 5;

/**
 * Inner command podman runs as the container's PID 1.  `sleep
 * infinity` is portable across both Alpine's busybox and Debian's
 * coreutils, and exits cleanly on SIGTERM.  Subsequent slice work
 * happens via `podman exec`; PID 1 just keeps the namespace alive.
 *
 * The path is **absolute** (`/bin/sleep`) so PID 1 starts even when
 * the slice's `$PATH` is too restrictive to find `sleep` by short
 * name.  This matters for callers who supply their own
 * `spec.env.PATH = /opt/myapp/bin` — without an absolute path we
 * would emit a confusing `crun: executable file `sleep` not found in
 * $PATH` error from `podman start`.  Both Alpine (busybox) and
 * Debian / Ubuntu / RHEL (coreutils) ship `sleep` at `/bin/sleep`
 * (RHEL has it as a `/usr/bin/sleep` symlink target via the usrmerge
 * symlink farm; the entry point is reachable through `/bin/sleep`
 * either way).
 */
const IDLE_PID1 = harden(['/bin/sleep', 'infinity']);

/**
 * Parse `podman --version` output into a version string.
 *
 * @param {string} stdout
 * @returns {string | undefined}
 */
const parsePodmanVersion = stdout => {
  const trimmed = stdout.trim();
  if (trimmed === '') return undefined;
  // Expected shape: "podman version X.Y.Z" — accept anything that
  // contains a digit run so distro patches do not break the parser.
  const match = trimmed.match(/(\d+(?:\.\d+){0,3})/);
  return match ? match[1] : trimmed;
};
harden(parsePodmanVersion);

/**
 * Spawn a child process and collect its stdout / stderr.  Used for
 * `--version` probes and short-lived control commands like `podman
 * pull` and `podman create`.
 *
 * @param {typeof import('child_process')} cpModule
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>}
 */
const spawnAndCollect = (cpModule, command, args) => {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = cpModule.spawn(command, args, { stdio: 'pipe' });
    } catch (e) {
      reject(/** @type {Error} */ (e));
      return;
    }
    /** @type {Buffer[]} */
    const stdoutChunks = [];
    /** @type {Buffer[]} */
    const stderrChunks = [];
    child.stdout?.on('data', chunk => stdoutChunks.push(chunk));
    child.stderr?.on('data', chunk => stderrChunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
};
harden(spawnAndCollect);

/**
 * Wrap a Node `Readable` stream as a single-use async iterable of
 * `Uint8Array` chunks.  Each `[Symbol.asyncIterator]()` call returns
 * the SAME underlying stream iterator — Node streams are not
 * re-iterable.  The factory's reader-ref adapter consumes the
 * iterator exactly once.
 *
 * @param {NodeJS.ReadableStream | null} stream
 * @returns {AsyncIterable<Uint8Array> | null}
 */
const readableToAsyncIterable = stream => {
  if (stream === null || stream === undefined) return null;
  /** @type {AsyncIterableIterator<Uint8Array> | null} */
  let cached = null;
  return {
    [Symbol.asyncIterator]() {
      if (cached === null) {
        cached = /** @type {any} */ (stream)[Symbol.asyncIterator]();
      }
      return /** @type {AsyncIterableIterator<Uint8Array>} */ (cached);
    },
  };
};
harden(readableToAsyncIterable);

/**
 * Generate a fresh slice container name.  The suffix is 8 hex
 * characters drawn from `Math.random` — collision-resistant enough for
 * the in-memory live-slice set on a single host without pulling in
 * `crypto`, which is overkill for a name suffix.
 *
 * @returns {string}
 */
const makeSliceName = () => {
  const a = Math.floor(Math.random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, '0');
  return `${ENDO_SANDBOX_PREFIX}${a}`;
};
harden(makeSliceName);

/**
 * Rootless network backend the driver prefers when mapping the
 * `private` profile to a `--network` value.  `slirp4netns` is the
 * historical podman default but recent rootless installs ship `pasta`
 * (passt) instead, and on those hosts `slirp4netns` is absent.  The
 * Phase 2 TODO explicitly anticipates the `pasta` fallback, so the
 * driver autodetects which backend is available and chooses
 * accordingly.  When both are present, slirp4netns wins for
 * compatibility with the documented egress nftables ruleset; when
 * only pasta is present, the driver picks pasta and surfaces the
 * choice via `slice.help()`.
 *
 * @typedef {'slirp4netns' | 'pasta' | null} RootlessNetBackend
 */

/**
 * Map a `SeccompPolicy` onto a `--security-opt seccomp=` argument.
 * Returns `undefined` for `'default'` because podman ships the same
 * containers/common allow-list the package documents in
 * `src/seccomp/default.json`; supplying our copy explicitly would only
 * drift over time.  `'unconfined'` becomes `seccomp=unconfined`; a
 * caller-supplied `{ profile }` is materialised at `prepareSlice` time
 * (the path is then folded into `assembleCreateArgv` via
 * `extras.seccompProfilePath`).
 *
 * @param {SliceSpec['seccomp']} policy
 * @param {string | null} seccompProfilePath
 * @returns {string | undefined}
 */
const seccompSecurityOpt = (policy, seccompProfilePath) => {
  if (policy === 'unconfined') return 'seccomp=unconfined';
  if (seccompProfilePath !== null) return `seccomp=${seccompProfilePath}`;
  return undefined;
};
harden(seccompSecurityOpt);

/**
 * Translate a `NetworkProfile` into the `--network` arg podman
 * accepts.  The `private` profile honours `backend` so the driver
 * can fall back to pasta on hosts that ship pasta but not
 * slirp4netns.  Unknown profiles raise a structured error (the
 * caller already validated upstream, but we re-validate as a defence
 * in depth).
 *
 * @param {SliceSpec['network']} profile
 * @param {RootlessNetBackend} backend
 * @returns {string}
 */
const networkArgForProfile = (profile, backend) => {
  switch (profile) {
    case 'none':
      return 'none';
    case 'private':
      // Both pasta and slirp4netns give the slice a private netns
      // with NAT'd outbound; in-netns nftables egress filtering is
      // the operator's responsibility under rootless podman, exactly
      // as the README documents for the bwrap driver's `private`
      // profile.
      if (backend === 'pasta') return 'pasta';
      // Default and `slirp4netns` both pick slirp4netns; the
      // explicit `port_handler=slirp4netns` keeps inbound port
      // forwarding behaviour stable across podman versions.
      return 'slirp4netns:port_handler=slirp4netns';
    case 'host-loopback':
    case 'host-lan':
    case 'host-net':
      // Per-profile filtering for host-loopback / host-lan needs
      // CAP_NET_ADMIN; the rootless slice cannot install host
      // firewall rules from inside.  Operators install the rules
      // from `HOST_LOOPBACK_ALLOWED_RANGES` / `HOST_LAN_ALLOWED_RANGES`
      // (see README).
      return 'host';
    default:
      throw makeError(X`unknown network profile ${q(profile)}`);
  }
};
harden(networkArgForProfile);

/**
 * Resolve the OCI image reference the slice should use as its rootfs.
 * Returns `undefined` for non-OCI rootfs specs; the caller will fall
 * back to a minimal image.  Phase 2 only supports `oci` rootfs on the
 * podman driver — `host-bind` / `mount` / `minimal` are bwrap-shaped.
 *
 * @param {SliceSpec['rootfs']} rootfs
 * @returns {string | undefined}
 */
const ociRefFromRootfs = rootfs => {
  if (
    typeof rootfs === 'object' &&
    rootfs !== null &&
    'kind' in rootfs &&
    rootfs.kind === 'oci'
  ) {
    const ociSpec = /** @type {{ kind: 'oci'; ref: string }} */ (rootfs);
    return ociSpec.ref;
  }
  return undefined;
};
harden(ociRefFromRootfs);

/**
 * Probe which rootless network backend is reachable from the daemon's
 * PATH.  Used at slice construction to pick the `private` profile's
 * `--network` value.  Returns the first available backend in
 * preference order (slirp4netns → pasta) or `null` if neither is
 * present, in which case the driver still constructs `none` and
 * `host-*` slices but rejects `private` with a structured error.
 *
 * @param {typeof import('child_process')} cp
 * @returns {Promise<RootlessNetBackend>}
 */
const probeRootlessNetBackend = async cp => {
  await null;
  for (const candidate of /** @type {const} */ (['slirp4netns', 'pasta'])) {
    let result;
    try {
      // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
      result = await spawnAndCollect(cp, candidate, ['--version']);
    } catch (e) {
      const cause = /** @type {Error & { code?: string }} */ (e);
      // eslint-disable-next-line no-continue
      if (cause.code === 'ENOENT') continue;
      // Other spawn errors (EACCES on a stripped binary, etc.) — skip
      // and try the next candidate; the empty PATH case is already
      // handled by the ENOENT branch.

      // eslint-disable-next-line no-continue
      continue;
    }
    if (result.code === 0) return candidate;
  }
  return null;
};
harden(probeRootlessNetBackend);

/**
 * Internal slice context the driver hands back from `prepareSlice` and
 * receives in `spawn` / `teardown`.
 *
 * @typedef {object} PodmanSliceContext
 * @property {string} containerName    Stable name (`endo-sandbox-…`).
 * @property {SliceSpec} spec          Original slice spec.
 * @property {string} runtime          Resolved OCI runtime override
 *                                     (`crun`, `runc`, …) or empty
 *                                     string when podman's default is
 *                                     in use.  Pinned at slice
 *                                     creation so subsequent spawns
 *                                     stay on the same runtime even if
 *                                     the host's default flips.
 * @property {Set<import('child_process').ChildProcess>} live  Live
 *                                     `podman exec` children for
 *                                     teardown.
 * @property {boolean} started         True after `podman start` has
 *                                     succeeded.  Subsequent spawns
 *                                     skip the start step.
 * @property {string | null} seccompTempPath  Temp file path holding the
 *                                     caller-supplied seccomp profile,
 *                                     or `null` when no profile was
 *                                     materialised.  Unlinked at
 *                                     teardown.
 * @property {{ cgroup2: { available: boolean, controllers: string[], reason?: string }, rootless: { available: boolean, reason?: string }, rootlessNet: { backend: RootlessNetBackend, reason?: string }, path: { value: string, source: 'env' | 'image' | 'fallback' } }} runtimeDetails
 *                                     Hardening-layer report the
 *                                     factory weaves into per-slice
 *                                     `help()` output.  `path`
 *                                     records which `PATH` the slice
 *                                     ended up with and where it came
 *                                     from (caller env, OCI image,
 *                                     or canonical fallback).
 */

/**
 * Resolve which `PATH` value the slice will actually use, and where it
 * came from.  Mirrors the bwrap driver's "caller wins, then the rootfs
 * defaults, then the canonical fallback" precedence so the two backends
 * present a consistent surface.
 *
 * Precedence:
 *   1. Caller-supplied `spec.env.PATH` — `'env'`.  An explicit empty
 *      string is honoured (the caller is opting out of any PATH).
 *   2. Image's `Config.Env` `PATH` — `'image'`.
 *   3. `DEFAULT_PATH` from `./path.js` — `'fallback'`.
 *
 * The `source` is surfaced in `slice.help()` so operators can tell
 * which case fired without inspecting the container's env directly.
 *
 * @param {SliceSpec} spec
 * @param {string | null} imagePath
 * @returns {{ value: string, source: 'env' | 'image' | 'fallback' }}
 */
const resolveSlicePath = (spec, imagePath) => {
  if (typeof spec.env.PATH === 'string') {
    return harden({ value: spec.env.PATH, source: 'env' });
  }
  if (typeof imagePath === 'string' && imagePath !== '') {
    return harden({ value: imagePath, source: 'image' });
  }
  return harden({ value: DEFAULT_PATH, source: 'fallback' });
};
harden(resolveSlicePath);

/**
 * Parse the JSON array emitted by
 * `podman image inspect --format '{{json .Config.Env}}'` and return the
 * value of the `PATH=` entry, if any.  Tolerant of malformed input:
 * non-array JSON, non-string entries, missing PATH all return `null`.
 *
 * Exported for unit testing — the integration path is exercised via
 * the live podman driver, but isolated parser tests want to drive
 * pathological shapes without rebuilding an OCI image.
 *
 * @param {string} configEnvJson
 * @returns {string | null}
 */
export const parseImagePathFromConfigEnv = configEnvJson => {
  let parsed;
  try {
    parsed = JSON.parse(configEnvJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const entry of parsed) {
    if (typeof entry === 'string' && entry.startsWith('PATH=')) {
      return entry.slice('PATH='.length);
    }
  }
  return null;
};
harden(parseImagePathFromConfigEnv);

/**
 * Assemble the `podman create` argv for a slice.  The image reference
 * and the trailing pid-1 command are appended last so the caller can
 * pass them in explicitly.
 *
 * @param {SliceSpec} spec
 * @param {string} containerName
 * @param {RootlessNetBackend} netBackend
 * @param {{ seccompProfilePath: string | null, pathInjection: string | null }} extras
 *   `pathInjection` is the `PATH` value to inject as `-e PATH=…` when
 *   the caller did not set one.  `null` means "leave the image's
 *   `Config.Env` PATH alone" — used when the caller's `spec.env`
 *   already includes a `PATH` (the per-key loop below emits the `-e`
 *   itself), or when the helper is invoked from a code path that
 *   does not need the synthesis.
 * @returns {string[]}
 */
const assembleCreateArgv = (spec, containerName, netBackend, extras) => {
  /** @type {string[]} */
  const argv = [
    'create',
    '--name',
    containerName,
    '--replace=false',
    // Hardening flags equivalent to bwrap's `--unshare-all` +
    // `--cap-drop ALL` posture.
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    // The slice's upper rootfs layer is read-only; writes go to the
    // scratch volume bound at /scratch (see below).  podman supplies a
    // tmpfs at /tmp /run /dev /var/tmp by default when --read-only is
    // set, which mirrors bwrap's `--tmpfs /tmp` etc.
    '--read-only',
    '--read-only-tmpfs=true',
    '--network',
    networkArgForProfile(spec.network, netBackend),
  ];

  // Optional seccomp override.  `'default'` falls through to podman's
  // bundled containers/common allow-list (no flag).
  const seccompOpt = seccompSecurityOpt(
    spec.seccomp,
    extras.seccompProfilePath,
  );
  if (seccompOpt !== undefined) {
    argv.push('--security-opt', seccompOpt);
  }

  // Caller-granted mounts.  podman's `--mount type=bind,…` form is
  // explicit about read-only vs. read-write.  We use `bind-propagation=rprivate`
  // (the default) so mount events do not leak across the namespace.
  for (const mount of spec.mounts) {
    const parts = [
      'type=bind',
      `source=${mount.hostPath}`,
      `target=${mount.innerPath}`,
    ];
    if (mount.mode === 'ro') parts.push('readonly');
    argv.push('--mount', parts.join(','));
  }

  // Writable scratch layer.  Mirrors the bwrap driver's `/scratch`
  // contract so callers see the same inner path on both backends.
  if (spec.scratchHostPath !== '') {
    argv.push(
      '--mount',
      `type=bind,source=${spec.scratchHostPath},target=/scratch`,
    );
  }

  // Environment.  podman starts its containers with a minimal env
  // already; we override / append the caller-supplied keys via -e.
  // When the caller did NOT set `PATH`, we inject `extras.pathInjection`
  // explicitly so the slice's `PATH` is observable from the host and
  // does not depend on whether the OCI image happened to set
  // `Config.Env`.  This mirrors the bwrap driver's `--setenv PATH=…`
  // path-synthesis behaviour.
  let hadPath = false;
  for (const [key, value] of Object.entries(spec.env)) {
    argv.push('-e', `${key}=${value}`);
    if (key === 'PATH') hadPath = true;
  }
  if (!hadPath && extras.pathInjection !== null) {
    argv.push('-e', `PATH=${extras.pathInjection}`);
  }

  if (spec.cwd !== undefined && spec.cwd !== '') {
    argv.push('--workdir', spec.cwd);
  }

  return argv;
};
harden(assembleCreateArgv);

/**
 * Construct the podman driver.
 *
 * @param {object} [input]
 * @param {Record<string, string>} [input.env]                Daemon env
 *                                                            (PATH etc.)
 * @param {typeof import('child_process')} [input.childProcess] Child-
 *                                                            process module
 *                                                            override
 *                                                            (tests).
 * @param {boolean} [input.reapOrphans]                       Whether to
 *                                                            sweep stale
 *                                                            `endo-sandbox-`
 *                                                            containers
 *                                                            on first
 *                                                            probe.  Defaults
 *                                                            to true.
 * @param {string} [input.ociRuntime]                         Override the
 *                                                            podman OCI
 *                                                            runtime
 *                                                            (`crun`, `runc`,
 *                                                            `krun`, …).  When
 *                                                            unset, the driver
 *                                                            keeps podman's
 *                                                            default runtime
 *                                                            unless that
 *                                                            runtime cannot
 *                                                            host `podman
 *                                                            exec` (e.g.
 *                                                            `krun`'s microVM
 *                                                            handler) — in
 *                                                            which case the
 *                                                            driver falls back
 *                                                            to `crun` /
 *                                                            `runc` so the
 *                                                            slice's spawn
 *                                                            surface keeps
 *                                                            working.
 * @returns {SandboxDriver}
 */
export const makePodmanDriver = ({
  env: _env = {},
  childProcess: childProcessModule,
  reapOrphans = true,
  ociRuntime,
} = {}) => {
  // Lazy-resolve `child_process` so callers in test environments can
  // inject a stub without paying the import cost up front.
  /** @type {typeof import('child_process') | undefined} */
  let cpModule = childProcessModule;
  const getCp = async () => {
    await null;
    if (cpModule === undefined) {
      cpModule = await import('child_process');
    }
    return cpModule;
  };

  // cgroup v2 is the only kernel-feature probe that is meaningful for
  // podman: Landlock applies to the daemon's own filesystem view, not
  // the container's, so we do not surface it on this driver.
  const cgroup2Probe = makeCgroup2Probe();

  /** @type {boolean} */
  let orphanSweepDone = false;

  /**
   * Cached OCI-runtime selection.  `null` until the first probe / slice
   * resolves it, then either a runtime name (`crun` / `runc`) we
   * inject as `--runtime <name>` or the empty string meaning "leave
   * podman's default alone".
   *
   * @type {string | null}
   */
  let resolvedRuntime = ociRuntime ?? null;

  /**
   * Runtimes we know support `podman exec`.  `krun` runs containers
   * inside a libkrun microVM, which the upstream conmon handler
   * cannot attach to via exec — that surfaces as the cryptic "the
   * handler does not support exec" error.  Falling back to `crun`
   * (or `runc`) keeps the slice spawn surface working without
   * requiring the caller to know about the discrepancy.
   *
   * Order is preference for fallback selection.
   */
  const EXEC_CAPABLE_RUNTIMES = harden(['crun', 'runc']);
  const EXEC_INCAPABLE_RUNTIMES = harden(['krun']);

  /**
   * Resolve the OCI runtime once per driver lifetime.  Caches into
   * `resolvedRuntime` so subsequent slices skip the probe.  When the
   * caller passed `ociRuntime` explicitly we honour their choice
   * verbatim; otherwise we look at podman's default and only override
   * it when the default is known to refuse exec.
   *
   * @param {typeof import('child_process')} cp
   * @returns {Promise<string>}  Empty string ⇒ no `--runtime` flag
   *                              should be added.
   */
  const ensureRuntime = async cp => {
    await null;
    if (resolvedRuntime !== null) return resolvedRuntime;
    let info;
    try {
      info = await spawnAndCollect(cp, 'podman', [
        'info',
        '--format',
        '{{.Host.OCIRuntime.Name}}',
      ]);
    } catch {
      resolvedRuntime = '';
      return resolvedRuntime;
    }
    const defaultRuntime = info.code === 0 ? info.stdout.trim() : '';
    if (
      defaultRuntime === '' ||
      !EXEC_INCAPABLE_RUNTIMES.includes(defaultRuntime)
    ) {
      // Either we could not detect a default (use podman's choice) or
      // the default already supports exec.  Either way: no override.
      resolvedRuntime = '';
      return resolvedRuntime;
    }
    // Default is exec-incapable.  Pick the first fallback that exists
    // on PATH; if none exist, surface the default and let podman fail
    // with its own error message.
    for (const candidate of EXEC_CAPABLE_RUNTIMES) {
      // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
      const v = await spawnAndCollect(cp, candidate, ['--version']).catch(
        () => null,
      );
      if (v !== null && v.code === 0) {
        resolvedRuntime = candidate;
        return resolvedRuntime;
      }
    }
    resolvedRuntime = '';
    return resolvedRuntime;
  };

  /**
   * Build a podman invocation argv with the resolved runtime prefix.
   * The prefix appears as a global flag (`--runtime crun`) before the
   * subcommand, matching podman's documented CLI ordering.
   *
   * @param {string} runtime  Empty string ⇒ no prefix.
   * @param {string[]} args
   * @returns {string[]}
   */
  const podmanArgs = (runtime, args) =>
    runtime === '' ? args : ['--runtime', runtime, ...args];

  /**
   * Reap leftover `endo-sandbox-` containers from a previous daemon
   * run.  Best-effort: failures are swallowed because a clean host
   * with no leftover containers is the common case.
   *
   * @param {typeof import('child_process')} cp
   * @returns {Promise<string[]>}  Names of containers that were
   *                                removed.
   */
  const sweepOrphans = async cp => {
    /** @type {string[]} */
    const reaped = [];
    const runtime = await ensureRuntime(cp);
    let listing;
    try {
      listing = await spawnAndCollect(
        cp,
        'podman',
        podmanArgs(runtime, [
          'ps',
          '-a',
          '--filter',
          `name=^${ENDO_SANDBOX_PREFIX}`,
          '--format',
          '{{.Names}}',
        ]),
      );
    } catch {
      return reaped;
    }
    if (listing.code !== 0) return reaped;
    const names = listing.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith(ENDO_SANDBOX_PREFIX));
    await Promise.all(
      names.map(async name => {
        await null;
        try {
          const result = await spawnAndCollect(
            cp,
            'podman',
            podmanArgs(runtime, ['rm', '-f', name]),
          );
          if (result.code === 0) reaped.push(name);
        } catch {
          // ignore; the container may have been removed concurrently
        }
      }),
    );
    return reaped;
  };

  /**
   * Probe podman availability and rootless mode.  Phase 2 requires
   * rootless: rootful podman is intentionally rejected because the
   * sandbox security model assumes the slice cannot escalate beyond
   * the daemon's user identity.
   *
   * @returns {Promise<Omit<BackendProbe, 'name'>>}
   */
  const probe = async () => {
    await null;
    let cp;
    try {
      cp = await getCp();
    } catch (e) {
      const cause = /** @type {Error} */ (e);
      return harden({
        available: false,
        reason: `child_process unavailable: ${cause.message}`,
      });
    }

    let versionResult;
    try {
      versionResult = await spawnAndCollect(cp, 'podman', ['--version']);
    } catch (e) {
      const cause = /** @type {Error & { code?: string }} */ (e);
      const reason =
        cause.code === 'ENOENT'
          ? 'podman binary not found on PATH'
          : `failed to spawn podman: ${cause.message}`;
      return harden({ available: false, reason });
    }
    if (versionResult.code !== 0) {
      return harden({
        available: false,
        reason: `podman --version exited with code ${q(versionResult.code)}: ${versionResult.stderr.trim() || versionResult.stdout.trim()}`,
      });
    }
    const version = parsePodmanVersion(versionResult.stdout);
    if (version === undefined) {
      return harden({
        available: false,
        reason: `could not parse podman --version output: ${q(versionResult.stdout)}`,
      });
    }

    // Rootless check.  `podman info --format` returns "true" / "false"
    // (or an error message) on stdout.  A non-zero exit means podman
    // could not initialise its storage; that is fatal for the driver.
    let rootlessResult;
    try {
      rootlessResult = await spawnAndCollect(cp, 'podman', [
        'info',
        '--format',
        '{{.Host.Security.Rootless}}',
      ]);
    } catch (e) {
      const cause = /** @type {Error} */ (e);
      return harden({
        available: false,
        reason: `podman info failed: ${cause.message}`,
      });
    }
    if (rootlessResult.code !== 0) {
      return harden({
        available: false,
        reason: `podman info exited with code ${q(rootlessResult.code)}: ${rootlessResult.stderr.trim() || rootlessResult.stdout.trim()}`,
      });
    }
    const rootlessText = rootlessResult.stdout.trim();
    /** @type {{ available: boolean; reason?: string }} */
    let rootless;
    if (rootlessText === 'true') {
      rootless = harden({ available: true });
    } else if (rootlessText === 'false') {
      rootless = harden({
        available: false,
        reason:
          'podman is configured for rootful mode; the @endo/sandbox driver requires rootless podman',
      });
    } else {
      rootless = harden({
        available: false,
        reason: `podman info returned unexpected rootless flag: ${q(rootlessText)}`,
      });
    }
    if (!rootless.available) {
      return harden({
        available: false,
        version,
        reason: rootless.reason,
        details: harden({ rootless }),
      });
    }

    // Resolve the OCI runtime up front so the orphan-reap step (and
    // every subsequent slice) honours the same `--runtime` choice as
    // `prepareSlice` / `spawn`.  The resolution is best-effort:
    // failures degrade to "no override".
    await ensureRuntime(cp);

    // Boot-time orphan reap.  We swallow the result list — the test
    // suite calls `_sweepOrphans()` directly when it wants to assert
    // names.
    if (reapOrphans && !orphanSweepDone) {
      orphanSweepDone = true;
      try {
        await sweepOrphans(cp);
      } catch {
        // ignore — best-effort
      }
    }

    const cgroup2 = await cgroup2Probe.probe();
    /** @type {BackendProbeDetails} */
    const details = harden({
      cgroup2: harden({
        available: cgroup2.available,
        controllers: cgroup2.controllers,
        ...(cgroup2.reason !== undefined ? { reason: cgroup2.reason } : {}),
      }),
      rootless,
    });
    return harden({ available: true, version, details });
  };

  /**
   * Cache of `image ref` → `Config.Env` PATH (or `null` when the
   * image declares no PATH / inspection failed).  Image refs are
   * effectively immutable once pulled; caching for the lifetime of
   * the driver avoids repeating `podman image inspect` for every
   * slice that reuses the same image, and the worst case under a
   * concurrent retag is a stale fallback that still produces a
   * working `PATH`.
   *
   * @type {Map<string, string | null>}
   */
  const imagePathCache = new Map();

  /**
   * Probe the OCI image's `Config.Env` for a `PATH=` entry and return
   * its value (or `null` when the image declares none).  Result is
   * cached in `imagePathCache` keyed by `ref`.
   *
   * Best-effort: any failure (inspect non-zero, malformed JSON, no
   * `Config.Env` key) is swallowed and surfaces as `null`, which
   * `resolveSlicePath` then maps onto the canonical `DEFAULT_PATH`.
   *
   * @param {typeof import('child_process')} cp
   * @param {string} ref
   * @returns {Promise<string | null>}
   */
  const inspectImagePath = async (cp, ref) => {
    if (imagePathCache.has(ref)) {
      // `Map.get` returns `T | undefined`; the `has` guard guarantees
      // the value is in the map, so a non-null assertion via cast is
      // safer than a `??` that would conflate "cached as null" with
      // "missing".
      return /** @type {string | null} */ (imagePathCache.get(ref) ?? null);
    }
    const runtime = await ensureRuntime(cp);
    let result;
    try {
      result = await spawnAndCollect(
        cp,
        'podman',
        podmanArgs(runtime, [
          'image',
          'inspect',
          '--format',
          '{{json .Config.Env}}',
          ref,
        ]),
      );
    } catch {
      imagePathCache.set(ref, null);
      return null;
    }
    if (result.code !== 0) {
      imagePathCache.set(ref, null);
      return null;
    }
    const imagePath = parseImagePathFromConfigEnv(result.stdout.trim());
    imagePathCache.set(ref, imagePath);
    return imagePath;
  };

  /**
   * Ensure the OCI image referenced by the slice spec is present in
   * the user's container storage.  No-op when the image is already
   * present (`podman image exists` exits 0).
   *
   * @param {typeof import('child_process')} cp
   * @param {string} ref
   * @returns {Promise<void>}
   */
  const ensureImage = async (cp, ref) => {
    const runtime = await ensureRuntime(cp);
    const exists = await spawnAndCollect(
      cp,
      'podman',
      podmanArgs(runtime, ['image', 'exists', ref]),
    );
    if (exists.code === 0) return;
    const pulled = await spawnAndCollect(
      cp,
      'podman',
      podmanArgs(runtime, ['pull', ref]),
    );
    if (pulled.code !== 0) {
      throw makeError(
        X`podman pull ${q(ref)} failed: ${q(pulled.stderr.trim() || pulled.stdout.trim())}`,
      );
    }
  };

  /**
   * @param {SliceSpec} spec
   * @returns {Promise<PodmanSliceContext>}
   */
  const prepareSlice = async spec => {
    if (
      spec.network !== 'none' &&
      spec.network !== 'private' &&
      spec.network !== 'host-loopback' &&
      spec.network !== 'host-lan' &&
      spec.network !== 'host-net'
    ) {
      throw makeError(X`unknown network profile ${q(spec.network)}`);
    }

    const ref = ociRefFromRootfs(spec.rootfs);
    if (ref === undefined) {
      // Phase 2 only supports OCI rootfs on the podman driver.  Other
      // shapes are bwrap-specific (host-bind / mount) or would require
      // bind-mounting the host as the container's rootfs, which is
      // out of scope for the OCI-image-centric driver.
      throw makeError(
        X`podman driver only supports rootfs: { kind: 'oci', ref }; got ${q(/** @type {any} */ (spec.rootfs).kind ?? typeof spec.rootfs)}`,
      );
    }

    const cp = await getCp();
    await ensureImage(cp, ref);

    // Probe the image's `Config.Env` PATH so the slice's `$PATH`
    // synthesis (below) has an image-derived default available.
    // The probe is cached per `ref` for the driver's lifetime; the
    // first slice for a given image pays the cost.
    const imagePath = await inspectImagePath(cp, ref);

    // Pick the rootless network backend up front so the runtime
    // report reflects what the slice actually got.  `none` and
    // `host-*` profiles do not require pasta / slirp4netns; only
    // `private` does.  When neither binary is on PATH but the caller
    // asked for `private`, fail with a structured error rather than
    // letting podman emit a generic ENOENT later.
    const netBackend = await probeRootlessNetBackend(cp);
    if (spec.network === 'private' && netBackend === null) {
      throw makeError(
        X`podman driver: network 'private' requires either slirp4netns or pasta on PATH; neither was found`,
      );
    }

    // Materialise a caller-supplied seccomp profile to a temp file so
    // podman can load it via `--security-opt seccomp=<path>`.  The
    // built-in `'default'` and `'unconfined'` policies do not need a
    // file — `seccompSecurityOpt` returns the right flag value (or
    // `undefined` for podman's default) without any side effect.
    /** @type {string | null} */
    let seccompTempPath = null;
    if (
      typeof spec.seccomp === 'object' &&
      spec.seccomp !== null &&
      'profile' in spec.seccomp
    ) {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'endo-sandbox-seccomp-'),
      );
      const file = path.join(dir, 'profile.json');
      const profile = /** @type {{ profile: unknown }} */ (spec.seccomp)
        .profile;
      const body =
        typeof profile === 'string'
          ? profile
          : profile instanceof Uint8Array
            ? Buffer.from(profile).toString('utf8')
            : JSON.stringify(profile);
      fs.writeFileSync(file, body);
      seccompTempPath = file;
    }

    const runtime = await ensureRuntime(cp);
    const containerName = makeSliceName();
    // Resolve the slice's effective `PATH` once so we can both inject
    // it into the container's create-time env and surface it via
    // `runtimeDetails.path` for `slice.help()`.  When the caller's
    // `spec.env` already includes a `PATH` we leave `pathInjection`
    // null and let the per-key loop in `assembleCreateArgv` emit it
    // (the resolved record still records `source: 'env'` so the help
    // line stays accurate).
    const slicePath = resolveSlicePath(spec, imagePath);
    const pathInjection = slicePath.source === 'env' ? null : slicePath.value;
    const createArgv = podmanArgs(runtime, [
      ...assembleCreateArgv(spec, containerName, netBackend, {
        seccompProfilePath: seccompTempPath,
        pathInjection,
      }),
      ref,
      ...IDLE_PID1,
    ]);
    const created = await spawnAndCollect(cp, 'podman', createArgv);
    if (created.code !== 0) {
      throw makeError(
        X`podman create failed: ${q(created.stderr.trim() || created.stdout.trim())}`,
      );
    }

    // Start the container immediately so subsequent `exec` calls have
    // a live PID 1 to attach to.  If start fails, we must rm the
    // half-created container so a retry can pick a fresh name.
    const started = await spawnAndCollect(
      cp,
      'podman',
      podmanArgs(runtime, ['start', containerName]),
    );
    if (started.code !== 0) {
      try {
        await spawnAndCollect(
          cp,
          'podman',
          podmanArgs(runtime, ['rm', '-f', containerName]),
        );
      } catch {
        // ignore — we are already in an error path
      }
      throw makeError(
        X`podman start failed: ${q(started.stderr.trim() || started.stdout.trim())}`,
      );
    }

    const cgroup2 = await cgroup2Probe.probe();
    /** @type {PodmanSliceContext['runtimeDetails']} */
    const runtimeDetails = harden({
      cgroup2: harden({
        available: cgroup2.available,
        controllers: cgroup2.controllers,
        ...(cgroup2.reason !== undefined ? { reason: cgroup2.reason } : {}),
      }),
      rootless: harden({ available: true }),
      rootlessNet: harden(
        netBackend === null
          ? {
              backend: /** @type {RootlessNetBackend} */ (null),
              reason:
                'no rootless network backend on PATH (slirp4netns / pasta)',
            }
          : { backend: netBackend },
      ),
      path: slicePath,
    });

    /** @type {PodmanSliceContext} */
    const ctx = {
      containerName,
      spec,
      runtime,
      live: new Set(),
      started: true,
      seccompTempPath,
      runtimeDetails,
    };
    return ctx;
  };

  /**
   * @param {PodmanSliceContext} slice
   * @param {string[]} argv
   * @param {SpawnOpts} opts
   * @returns {Promise<DriverProcess>}
   */
  const spawn = async (slice, argv, opts) => {
    if (argv.length === 0) {
      throw makeError(X`spawn argv must be non-empty`);
    }
    const cp = await getCp();

    /** @type {string[]} */
    const innerArgv = ['exec', '-i'];

    // Per-spawn cwd override.  Falls back to the slice's --workdir.
    if (opts.cwd !== undefined && opts.cwd !== '') {
      innerArgv.push('--workdir', opts.cwd);
    }

    // Per-spawn env overrides, layered on top of the slice's --env
    // dictionary (already baked into the container).
    if (opts.env !== undefined) {
      for (const [key, value] of Object.entries(opts.env)) {
        innerArgv.push('-e', `${key}=${value}`);
      }
    }

    innerArgv.push(slice.containerName, ...argv);
    const execArgv = podmanArgs(slice.runtime, innerArgv);

    /** @type {import('child_process').ChildProcess} */
    let child;
    try {
      child = cp.spawn('podman', execArgv, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      });
    } catch (e) {
      throw makeError(
        X`failed to spawn podman exec: ${q(/** @type {Error} */ (e).message)}`,
      );
    }

    slice.live.add(child);

    /** @type {Promise<{ code: number | null; signal: string | null }>} */
    const exited = new Promise((resolve, reject) => {
      child.once('error', err => {
        slice.live.delete(child);
        reject(err);
      });
      child.once('close', (code, signal) => {
        slice.live.delete(child);
        resolve({ code, signal });
      });
    });

    const stdinStream = child.stdin;
    /** @type {DriverProcess & { writeStdin(chunk: Uint8Array): Promise<void>, closeStdin(): Promise<void> }} */
    const driverProcExtended = harden({
      pid: child.pid ?? -1,
      stdin: null,
      stdout: readableToAsyncIterable(child.stdout),
      stderr: readableToAsyncIterable(child.stderr),
      wait: () => exited,
      kill: async signal => {
        // `podman exec` is a foreground proxy: SIGTERM / SIGINT are
        // forwarded to the in-container process.  For SIGKILL the
        // proxy itself dies first, leaving the container-side process
        // to be cleaned up by the next `podman exec` or by the
        // container's PID-1 reaper at teardown.  This is the same
        // failure mode rootless docker has and is acceptable for the
        // sandbox's lifecycle guarantees.
        try {
          child.kill(/** @type {NodeJS.Signals} */ (signal ?? 'SIGTERM'));
        } catch (e) {
          const err = /** @type {Error & { code?: string }} */ (e);
          if (err.code !== 'ESRCH') throw err;
        }
      },
      /** @param {Uint8Array} chunk */
      writeStdin: async chunk => {
        if (stdinStream === null || stdinStream === undefined) return;
        await new Promise((resolve, reject) => {
          stdinStream.write(chunk, err =>
            err ? reject(err) : resolve(undefined),
          );
        });
      },
      closeStdin: async () => {
        if (stdinStream === null || stdinStream === undefined) return;
        await new Promise(resolve => stdinStream.end(() => resolve(undefined)));
      },
    });
    return /** @type {DriverProcess} */ (driverProcExtended);
  };

  /**
   * @param {PodmanSliceContext} slice
   * @returns {Promise<void>}
   */
  const teardown = async slice => {
    /** @type {Promise<void>[]} */
    const reaped = [];
    for (const child of slice.live) {
      reaped.push(
        new Promise(resolve => {
          /** @type {NodeJS.Timeout | undefined} */
          let killTimer;
          const finish = () => {
            if (killTimer !== undefined) clearTimeout(killTimer);
            resolve();
          };
          child.once('close', finish);
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          killTimer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, DEFAULT_KILL_GRACE_MS);
        }),
      );
    }
    await Promise.all(reaped);
    slice.live.clear();

    let cp;
    try {
      cp = await getCp();
    } catch {
      return;
    }

    // `podman stop` sends SIGTERM and then SIGKILL after the grace
    // window; rm cleans the container record.  Both are best-effort
    // because teardown is also called from disposal-of-already-dead
    // slices.
    try {
      await spawnAndCollect(
        cp,
        'podman',
        podmanArgs(slice.runtime, [
          'stop',
          '--time',
          String(DEFAULT_STOP_GRACE_S),
          slice.containerName,
        ]),
      );
    } catch {
      // ignore — proceed to rm
    }
    try {
      await spawnAndCollect(
        cp,
        'podman',
        podmanArgs(slice.runtime, ['rm', '-f', slice.containerName]),
      );
    } catch {
      // ignore
    }
    slice.started = false;

    // Unlink any seccomp profile we materialised for `--security-opt
    // seccomp=<path>`.  Best-effort: if the temp file was already
    // collected by an external sweep, swallow the error.
    if (slice.seccompTempPath !== null) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const seccompPath = slice.seccompTempPath;
        await fs.promises.unlink(seccompPath);
        await fs.promises.rmdir(path.dirname(seccompPath));
      } catch {
        // already gone
      }
      slice.seccompTempPath = null;
    }
  };

  return harden({
    name: /** @type {const} */ ('podman'),
    probe,
    prepareSlice,
    spawn,
    teardown,
  });
};
harden(makePodmanDriver);
