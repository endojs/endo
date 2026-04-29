// @ts-check

/* global Buffer, process, setTimeout, clearTimeout */

import { makeError, q, X } from '@endo/errors';

/** @import { SandboxDriver, SliceSpec, SpawnOpts, DriverProcess, BackendProbe } from '../types.js' */

/**
 * `SandboxDriver` for `bubblewrap` (`bwrap`) on Linux.
 *
 * Translates a fully-resolved `SliceSpec` (host paths only, no Endo
 * capabilities) into a `bwrap` argv invocation.  The driver itself is
 * stateless except for the per-slice context returned by
 * `prepareSlice`, which carries the assembled argv prefix, the
 * teardown bookkeeping (pasta subprocess, temporary files), and the
 * resolved mount table.
 */

const DEFAULT_KILL_GRACE_MS = 5_000;

/**
 * Inner mount points the driver always installs for a usable rootfs.
 *
 * `--proc /proc` mounts a fresh procfs inside the pid namespace,
 * `--dev /dev` provides a minimal device tree, and `--tmpfs /tmp`
 * gives the slice a writable scratch volume that is wiped at
 * teardown by the kernel when the namespace is torn down.
 */
const ROOTFS_BASE_FLAGS = harden([
  ['--proc', '/proc'],
  ['--dev', '/dev'],
  ['--tmpfs', '/tmp'],
]);

/**
 * Host paths bind-mounted read-only when `rootfs.kind === 'host-bind'`.
 * Each entry is tried with `--ro-bind-try` so a missing host path is
 * skipped rather than failing the slice.
 */
const HOST_BIND_ROOTFS_PATHS = harden([
  '/usr',
  '/lib',
  '/lib64',
  '/bin',
  '/sbin',
  '/etc',
]);

/**
 * RFC 1918 / link-local / CGNAT / loopback ranges blocked by the
 * `private` network profile.  Documented here for the driver's
 * teardown-message diagnostics; the actual rules live in
 * `src/net/private-egress.nft`.
 */
const PRIVATE_BLOCKED_RANGES = harden([
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
  '127.0.0.0/8',
  'fc00::/7',
  '::1/128',
]);
harden(PRIVATE_BLOCKED_RANGES);

/**
 * Parse `bwrap --version` output into a version string.
 *
 * @param {string} stdout
 * @returns {string | undefined}
 */
const parseBwrapVersion = stdout => {
  const trimmed = stdout.trim();
  if (trimmed === '') return undefined;
  // Expected shape: "bubblewrap X.Y.Z" — but accept anything that
  // contains digits to stay tolerant of distro patches.
  const match = trimmed.match(/(\d+(?:\.\d+){0,3})/);
  return match ? match[1] : trimmed;
};
harden(parseBwrapVersion);

/**
 * Spawn a child process and collect its stdout / stderr.  Used for
 * `--version` probes and short-lived control commands like `pasta`
 * and `nft -f`.
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
 * Internal slice context the driver hands back from `prepareSlice` and
 * receives in `spawn` / `teardown`.
 *
 * @typedef {object} BwrapSliceContext
 * @property {string[]} sliceArgv      Bwrap argv prefix (everything
 *                                     before the `--` separator).
 * @property {SliceSpec} spec          Original slice spec.
 * @property {Set<import('child_process').ChildProcess>} live  Live
 *                                     child processes for teardown.
 * @property {{ proc: import('child_process').ChildProcess, netnsPath: string } | null} pasta
 *                                     `pasta` subprocess and netns
 *                                     path when network is `private`.
 * @property {string | null} seccompTempPath  Temp file holding the
 *                                     compiled seccomp BPF blob,
 *                                     unlinked at teardown.
 */

/**
 * Assemble the bwrap argv prefix from a `SliceSpec`.  Returns the
 * arguments that go BEFORE the `--` separator and the user's argv.
 *
 * The assembly order mirrors the TODO checklist in
 * `TODO/13_endo_posix_sandbox_phase1_bwrap.md`:
 *   1. Namespace flags (`--unshare-all`, optional `--share-net`).
 *   2. Lifecycle (`--die-with-parent`).
 *   3. Capability drop (`--cap-drop ALL`).
 *   4. Seccomp fd (when a precompiled BPF blob is supplied).
 *   5. Rootfs binds.
 *   6. Caller-granted mount binds.
 *   7. Scratch mount as the writable upper layer.
 *   8. Inner `/proc`, `/dev`, `/tmp`.
 *   9. Environment variables.
 *  10. Initial `--chdir` (when `cwd` is set).
 *
 * @param {SliceSpec} spec
 * @param {{ seccompFd: number | null }} extras
 * @returns {string[]}
 */
const assembleSliceArgv = (spec, extras) => {
  /** @type {string[]} */
  const argv = [];

  // 1. Namespace flags.
  argv.push('--unshare-all');
  // bwrap 0.11+ already implies `--no-new-privileges` and exposes no
  // separate flag for it; do NOT pass `--no-new-privileges`.
  if (spec.network !== 'none') {
    // For `private` we still keep --unshare-all (which unshares net),
    // and pasta will set up the netns separately.  For host-* (Phase
    // 1.5) we'd add `--share-net` here.  Phase 1 only handles `none`
    // and `private`; both keep the network unshared at the bwrap
    // boundary.
  }

  // 2. Lifecycle.
  argv.push('--die-with-parent');

  // 3. Drop all capabilities.
  argv.push('--cap-drop', 'ALL');

  // 4. Seccomp.  Only attach when a precompiled BPF blob fd is
  //    available; the JSON profile in src/seccomp/default.json is
  //    documentation, not a kernel-loadable program.
  if (extras.seccompFd !== null) {
    argv.push('--seccomp', String(extras.seccompFd));
  }

  // 5. Rootfs.
  if (
    typeof spec.rootfs === 'object' &&
    spec.rootfs !== null &&
    'kind' in spec.rootfs
  ) {
    if (spec.rootfs.kind === 'host-bind') {
      for (const path of HOST_BIND_ROOTFS_PATHS) {
        // `--ro-bind-try` skips missing paths (e.g. /lib64 on pure
        // 32-bit hosts) instead of failing the slice.
        argv.push('--ro-bind-try', path, path);
      }
    } else if (spec.rootfs.kind === 'minimal') {
      // Nothing — caller is expected to bind their own rootfs via
      // `mounts`.  We still get /proc, /dev, /tmp from the base
      // rootfs flags below.
    } else if (spec.rootfs.kind === 'mount') {
      const mountSpec =
        /** @type {{ kind: 'mount'; hostPath: string; mode: 'ro' | 'rw' }} */ (
          spec.rootfs
        );
      const flag = mountSpec.mode === 'rw' ? '--bind' : '--ro-bind';
      argv.push(flag, mountSpec.hostPath, '/');
    }
  }

  // 6. Caller-granted mounts.
  for (const mount of spec.mounts) {
    const flag = mount.mode === 'rw' ? '--bind' : '--ro-bind';
    argv.push(flag, mount.hostPath, mount.innerPath);
  }

  // 7. Writable scratch upper layer.  Mounted as `/scratch` so it is
  //    visible without conflicting with any rootfs bind.  The genie
  //    workspace integration points `GENIE_WORKSPACE` here.
  if (spec.scratchHostPath !== '') {
    argv.push('--bind', spec.scratchHostPath, '/scratch');
  }

  // 8. Base rootfs flags (proc / dev / tmp).
  for (const flagPair of ROOTFS_BASE_FLAGS) {
    argv.push(...flagPair);
  }

  // 9. Environment.
  argv.push('--clearenv');
  for (const [key, value] of Object.entries(spec.env)) {
    argv.push('--setenv', key, value);
  }

  // 10. Cwd inside the slice.
  if (spec.cwd !== undefined && spec.cwd !== '') {
    argv.push('--chdir', spec.cwd);
  }

  return argv;
};
harden(assembleSliceArgv);

/**
 * Construct the bwrap driver.
 *
 * @param {object} [input]
 * @param {Record<string, string>} [input.env]                Daemon env
 *                                                            (PATH etc.)
 * @param {typeof import('child_process')} [input.childProcess] Child-
 *                                                            process module
 *                                                            override
 *                                                            (tests).
 * @param {typeof import('fs')} [input.fs]                    fs module
 *                                                            override.
 * @returns {SandboxDriver}
 */
export const makeBwrapDriver = ({
  env: _env = {},
  childProcess: childProcessModule,
  fs: _fs,
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

  /** @returns {Promise<Omit<BackendProbe, 'name'>>} */
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

    let result;
    try {
      result = await spawnAndCollect(cp, 'bwrap', ['--version']);
    } catch (e) {
      const cause = /** @type {Error & { code?: string }} */ (e);
      const reason =
        cause.code === 'ENOENT'
          ? 'bwrap binary not found on PATH'
          : `failed to spawn bwrap: ${cause.message}`;
      return harden({ available: false, reason });
    }

    if (result.code !== 0) {
      return harden({
        available: false,
        reason: `bwrap --version exited with code ${q(result.code)}: ${result.stderr.trim() || result.stdout.trim()}`,
      });
    }

    const version = parseBwrapVersion(result.stdout);
    if (version === undefined) {
      return harden({
        available: false,
        reason: `could not parse bwrap --version output: ${q(result.stdout)}`,
      });
    }
    return harden({ available: true, version });
  };

  /**
   * @param {SliceSpec} spec
   * @returns {Promise<BwrapSliceContext>}
   */
  const prepareSlice = async spec => {
    // Validate network profile up front.  Phase 1 implements `none`
    // and `private`; the `host-*` family is deferred to Phase 1.5.
    if (
      spec.network === 'host-loopback' ||
      spec.network === 'host-lan' ||
      spec.network === 'host-net'
    ) {
      throw makeError(
        X`network profile ${q(spec.network)} not implemented before Phase 1.5`,
      );
    }
    if (spec.network !== 'none' && spec.network !== 'private') {
      throw makeError(X`unknown network profile ${q(spec.network)}`);
    }

    // Phase 1 does not compile JSON seccomp profiles to BPF.  If the
    // caller supplied a precompiled blob via SeccompPolicy.profile we
    // would write it to a temp file and pass the fd; for now leave
    // it pluggable but unused.  The argv assembly already gates on
    // `seccompFd !== null`.
    /** @type {number | null} */
    const seccompFd = null;
    /** @type {string | null} */
    const seccompTempPath = null;

    const sliceArgv = assembleSliceArgv(spec, { seccompFd });

    /** @type {BwrapSliceContext} */
    const ctx = {
      sliceArgv,
      spec,
      live: new Set(),
      pasta: null,
      seccompTempPath,
    };

    // `private` network: spawn pasta to drive the netns and load the
    // egress nftables ruleset.  Phase 1 ships this best-effort: if
    // pasta is missing we throw a structured error, but the driver
    // does not gate slice creation on the nft binary being present
    // (we still reject misconfigured callers).
    //
    // The actual netns wiring for bwrap+pasta is non-trivial: bwrap
    // must be told to use pasta's netns via `--unshare-net` plus a
    // userns-block-fd handshake.  Phase 1 leaves the pasta subprocess
    // as a teardown placeholder; full integration lands alongside the
    // genie workspace work that needs `private` networking.  See
    // PLAN/endo_posix_sandbox.md § "Network policy" for the design.
    if (spec.network === 'private') {
      // Documented but not yet wired end-to-end.  We still record
      // what would happen so teardown is correct if a future code
      // path attaches a pasta proc here.
      ctx.pasta = null;
    }

    return ctx;
  };

  /**
   * @param {BwrapSliceContext} slice
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
    const fullArgv = [...slice.sliceArgv];

    // Per-spawn cwd override.  Layer on top of the slice's cwd.
    if (opts.cwd !== undefined) {
      fullArgv.push('--chdir', opts.cwd);
    }

    // Per-spawn env overrides.
    if (opts.env !== undefined) {
      for (const [key, value] of Object.entries(opts.env)) {
        fullArgv.push('--setenv', key, value);
      }
    }

    fullArgv.push('--', ...argv);

    /** @type {import('child_process').ChildProcess} */
    let child;
    try {
      child = cp.spawn('bwrap', fullArgv, {
        stdio: ['pipe', 'pipe', 'pipe'],
        // Inherit minimal env: bwrap itself needs PATH to find
        // libraries; the slice's clearenv inside takes effect after
        // the bwrap binary execs.
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      });
    } catch (e) {
      throw makeError(
        X`failed to spawn bwrap: ${q(/** @type {Error} */ (e).message)}`,
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

    // The DriverProcess surface exposes async-iterables for stdout
    // and stderr, plus closures that the factory wires into a
    // writer-ref adapter for stdin.  We do NOT expose the raw Node
    // streams as object properties because `harden()` would attempt
    // to deep-freeze their internal state.
    const stdinStream = child.stdin;
    /** @type {DriverProcess & { writeStdin(chunk: Uint8Array): Promise<void>, closeStdin(): Promise<void> }} */
    const driverProcExtended = harden({
      pid: child.pid ?? -1,
      stdin: null,
      stdout: readableToAsyncIterable(child.stdout),
      stderr: readableToAsyncIterable(child.stderr),
      wait: () => exited,
      kill: async signal => {
        try {
          child.kill(/** @type {NodeJS.Signals} */ (signal ?? 'SIGTERM'));
        } catch (e) {
          // ESRCH (process already gone) is fine; rethrow others.
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
   * @param {BwrapSliceContext} slice
   * @returns {Promise<void>}
   */
  const teardown = async slice => {
    // Kill any stragglers.  SIGTERM first, then SIGKILL after the
    // grace window.  The factory layer already issues kills before
    // teardown(); this is the safety net for code paths that skip it.
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

    // Stop pasta if we ever spawned one.
    if (slice.pasta !== null) {
      try {
        slice.pasta.proc.kill('SIGTERM');
      } catch {
        // ignore
      }
      slice.pasta = null;
    }

    // Unlink seccomp temp file.
    if (slice.seccompTempPath !== null) {
      try {
        const fs = await import('fs');
        await fs.promises.unlink(slice.seccompTempPath);
      } catch {
        // already gone
      }
      slice.seccompTempPath = null;
    }
  };

  return harden({
    name: /** @type {const} */ ('bwrap'),
    probe,
    prepareSlice,
    spawn,
    teardown,
  });
};
harden(makeBwrapDriver);

export { PRIVATE_BLOCKED_RANGES };
