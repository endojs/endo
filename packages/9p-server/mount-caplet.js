// @ts-check

/**
 * Unconfined caplet: mount an `@endo/platform/fs/extended` `Filesystem`
 * capability (possibly a remote CapTP presence) into the host Linux
 * kernel via 9P2000.L.
 *
 * Run it with, e.g.:
 *
 * ```sh
 * endo make-unconfined packages/9p-server/mount-caplet.js \
 *   --name fs-mounter --powers \@none
 * # then, from a caplet/REPL that holds both `fs-mounter` and an
 * # endo-fs `Filesystem` cap named `my-fs`:
 * #   const h = await E(fsMounter).mount(myFs, '/mnt/endo', {});
 * #   …
 * #   await E(h).unmount();           // or let teardown do it
 * ```
 *
 * `make()` returns a *mounter* exo.  Each `mount(fs, mountPoint,
 * options)` call:
 *   1. stands up a `makeFsBridge9p` 9P server on a per-mount Unix
 *      domain socket,
 *   2. shells out to `mount -t 9p -o trans=unix,version=9p2000.L,…`
 *      to attach the socket to `mountPoint`,
 *   3. returns a `MountHandle` exo whose `unmount()` reverses both
 *      steps.
 *
 * **Teardown.** The caplet wires the daemon's cancellation context
 * (`context.whenCancelled()`): when the caplet formula is cancelled
 * (worker terminated, formula removed, daemon shutdown) every live
 * mount is `umount`ed and its bridge stopped on a best-effort basis.
 *
 * **Privilege.** `mount(2)` / `umount(2)` need `CAP_SYS_ADMIN`.  The
 * daemon worker is rarely root, so by default this will fail with a
 * permission error unless the daemon runs privileged.  Supply
 * `options.mountProgram` / `options.umountProgram` (e.g.
 * `['sudo', 'mount']`) — or set `NINEP_SUDO=1` in the caplet's env —
 * to route through a privilege helper.
 *
 * @module
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, q, X } from '@endo/errors';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rmdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import nodePath from 'node:path';
import process from 'node:process';

import { makeFsBridge9p } from './src/fs-bridge.js';

/** @import { ERef } from '@endo/eventual-send' */

const execFileP = promisify(execFile);

const MountHandleInterface = M.interface('Fs9pMountHandle', {
  unmount: M.call().returns(M.promise()),
  mountPoint: M.call().returns(M.string()),
  socketPath: M.call().returns(M.string()),
  help: M.call().returns(M.string()),
});

const MounterInterface = M.interface('Fs9pMounter', {
  mount: M.call(M.any(), M.string()).optional(M.record()).returns(M.promise()),
  list: M.call().returns(M.array()),
  help: M.call().returns(M.string()),
});

/**
 * Pick a default directory for the per-mount UDS.  Prefer the XDG
 * runtime dir (tmpfs, 0700, per-user) so the socket — which carries
 * the *full authority* of the projected FS cap — is not world-visible.
 *
 * @param {Record<string, string>} env
 */
const defaultSocketDir = env =>
  env.XDG_RUNTIME_DIR || env.NINEP_SOCKET_DIR || os.tmpdir();

/**
 * Mount options whose value is load-bearing for confinement: `trans`
 * pins the kernel mount to *this* bridge socket, `version` pins the
 * dialect, and `access` governs the uid model. A caller must not be
 * able to override them via `extraMountOptions` (which is appended last
 * and would win under v9fs's last-key-wins parsing) — e.g.
 * `extraMountOptions: 'trans=tcp,port=…'` would redirect the privileged
 * mount to an attacker-chosen 9P server. So we reject those keys.
 */
const PINNED_MOUNT_OPTION_KEYS = harden(['trans', 'version', 'access']);

const baseName = s => {
  const t = String(s);
  return t.slice(t.lastIndexOf('/') + 1);
};

/**
 * Reject `extraMountOptions` that try to override a pinned key.
 *
 * @param {unknown} extra
 */
const assertExtraMountOptions = extra => {
  if (extra === undefined || extra === '') return;
  if (typeof extra !== 'string') {
    throw makeError(
      X`extraMountOptions must be a string, got ${q(typeof extra)}`,
    );
  }
  for (const part of extra.split(',')) {
    const key = part.split('=')[0].trim();
    if (PINNED_MOUNT_OPTION_KEYS.includes(key)) {
      throw makeError(
        X`extraMountOptions may not set the pinned option ${q(key)} (it carries the mount's transport/confinement); got ${q(extra)}`,
      );
    }
  }
};

/**
 * Footgun guard (not a security boundary — the mounter cap is held only
 * by trusted callers): a caller-supplied `mount`/`umount` program vector
 * must actually invoke the expected command, so a typo like
 * `umountProgram: ['rm']` fails loudly instead of `rm`-ing the mount
 * point. The trailing element is the binary the fixed `9p` argv is
 * appended to; only its basename is checked, so a privilege-helper
 * prefix with flags (`['sudo', '-u', 'svc', 'mount']`) is preserved.
 *
 * @param {string[]} program
 * @param {string} expectedCommand  `'mount'` | `'umount'`
 * @param {string} label
 */
const assertProgram = (program, expectedCommand, label) => {
  if (!Array.isArray(program) || program.length === 0) {
    throw makeError(X`${label} must be a non-empty array of strings`);
  }
  if (baseName(program[program.length - 1]) !== expectedCommand) {
    throw makeError(
      X`${label} must invoke ${q(expectedCommand)}; got ${q(String(program[program.length - 1]))}`,
    );
  }
};

/**
 * Build the comma-separated `-o` value for `mount -t 9p`.
 *
 * @param {Record<string, unknown>} options
 */
const buildMountOptionString = options => {
  const {
    trans = 'unix',
    version = '9p2000.L',
    // The bridge's server caps msize at 128 KiB (DEFAULT_MSIZE in
    // src/server.js); offering more just gets shrunk in the Rversion
    // reply, so default to the value the kernel will actually get.
    msize = 131_072,
    access = 'any',
    cache = 'none',
    readOnly = false,
    extraMountOptions = '',
  } = options;
  const parts = [
    `trans=${trans}`,
    `version=${version}`,
    `msize=${msize}`,
    `access=${access}`,
    `cache=${cache}`,
  ];
  if (readOnly) parts.push('ro');
  assertExtraMountOptions(extraMountOptions);
  if (extraMountOptions) parts.push(String(extraMountOptions));
  return parts.join(',');
};

/**
 * Resolve the caplet's cancellation promise from whatever shape the
 * daemon handed us as `context`.  Mirrors the tolerant resolution in
 * `packages/lal/agent.js` and `packages/fae/agent.js`: a context
 * presence exposes `whenCancelled()`; an in-process context exposes a
 * `cancelled` promise; `null`/absent means "no teardown signal".
 *
 * @param {Promise<any> | any} context
 * @returns {Promise<Promise<never> | null>}
 */
const resolveCancelled = async context => {
  if (!context) return null;
  const resolved = await context;
  if (!resolved) return null;
  if (typeof resolved.whenCancelled === 'function') {
    return E(resolved).whenCancelled();
  }
  if (resolved.cancelled) {
    return resolved.cancelled;
  }
  return null;
};

/**
 * Build the mounter exo from injected effects.  `make()` wires the real
 * Node bindings (`execFile`, `fs.mkdir`/`rmdir`, `makeFsBridge9p`);
 * tests inject fakes so the privileged `mount(2)` path can be exercised
 * without root or a real kernel.
 *
 * @param {object} deps
 * @param {Record<string, string>} [deps.env] - caplet env (e.g. NINEP_SUDO).
 * @param {Promise<never> | null} [deps.cancelledP] - settles on caplet teardown.
 * @param {(file: string, args: string[]) => Promise<unknown>} deps.runProgram - `execFile`-shaped runner.
 * @param {(path: string, opts: { recursive: boolean }) => Promise<unknown>} deps.makeDir
 * @param {(path: string) => Promise<unknown>} deps.removeDir
 * @param {(opts: { fs: ERef<any>, socketPath: string, cancelled?: Promise<unknown> }) => any} deps.makeBridge
 */
export const makeFsMounter = ({
  env = {},
  cancelledP = null,
  runProgram,
  makeDir,
  removeDir,
  makeBridge,
}) => {
  /** @type {Set<{ unmount: () => Promise<void> }>} */
  const handles = new Set();

  // Monotonic per-caplet counter so concurrent mount() calls never
  // collide on the default socket name (handles.size is read before a
  // handle is registered, so two interleaved calls would otherwise
  // compute the same path within the same millisecond).
  let mountCounter = 0;

  // Set once the caplet's context is cancelled, so a mount() that
  // races (or follows) teardown refuses rather than leaking a kernel
  // mount + socket the sweeper has already run past.
  let cancelled = false;

  const unmountAll = async () => {
    await Promise.all(
      [...handles].map(handle =>
        handle.unmount().catch(err => {
          // Best-effort during teardown — surface but don't reject.
          // eslint-disable-next-line no-console
          console.error('[9p mount-caplet] teardown unmount failed', err);
        }),
      ),
    );
  };

  if (cancelledP) {
    // The cancelled promise is reject-only; attach to both arms so a
    // future resolve-style trigger still sweeps.
    Promise.resolve(cancelledP).then(
      () => {
        cancelled = true;
        return unmountAll();
      },
      () => {
        cancelled = true;
        return unmountAll();
      },
    );
  }

  // mount/umount programs are OPERATOR configuration (env), never a
  // per-call option. The mounter cap is handed to an otherwise-untrusted
  // party whose only granted authority is "mount any files"; letting the
  // caller choose the program would be arbitrary privileged execution
  // (e.g. `umountProgram: ['rm']` → `rm -- <mountPoint>`). `NINEP_SUDO`
  // routes through sudo; `NINEP_MOUNT_PROGRAM` / `NINEP_UMOUNT_PROGRAM`
  // (whitespace-separated) let the operator name a custom helper.
  const sudo = env.NINEP_SUDO === '1';
  const splitProgram = v => v.trim().split(/\s+/).filter(Boolean);
  const mountProgram = env.NINEP_MOUNT_PROGRAM
    ? splitProgram(env.NINEP_MOUNT_PROGRAM)
    : sudo
      ? ['sudo', 'mount']
      : ['mount'];
  const umountProgram = env.NINEP_UMOUNT_PROGRAM
    ? splitProgram(env.NINEP_UMOUNT_PROGRAM)
    : sudo
      ? ['sudo', 'umount']
      : ['umount'];
  assertProgram(mountProgram, 'mount', 'NINEP_MOUNT_PROGRAM');
  assertProgram(umountProgram, 'umount', 'NINEP_UMOUNT_PROGRAM');

  /**
   * @param {ERef<any>} fs - endo-fs `Filesystem` capability to project.
   * @param {string} mountPoint - host path to mount onto.
   * @param {object} [mountOptions]
   */
  const mount = async (fs, mountPoint, mountOptions = {}) => {
    if (cancelled) {
      throw makeError(X`mounter is cancelled; refusing to mount`);
    }
    // Defensively copy + harden the caller's options before any field
    // flows toward a privileged `mount(2)`.  `mountOptions` arrives
    // over CapTP from a potentially adversarial caller; the shallow
    // spread reads every own-enumerable property exactly once,
    // defeating a `Proxy`-backed record whose per-access getter could
    // otherwise differentiate the value validated here from the one
    // passed to `mount`, and `harden` freezes the result (cf.
    // `packages/genie/AGENTS.md` § "deep-harden every structured
    // input").
    const opts = /** @type {Record<string, unknown>} */ (
      harden({ ...mountOptions })
    );

    mountCounter += 1;
    const resolvedMountPoint = nodePath.resolve(mountPoint);
    // The UDS path is internal plumbing, not a free-form caller input:
    // the bridge `unlink()`s it before binding, so an arbitrary
    // caller-chosen path would be an arbitrary-delete primitive with the
    // daemon's authority. A caller may still pin a name, but only inside
    // the socket directory; otherwise we generate a random one (the UDS
    // carries the projected FS cap's full authority, so on the
    // world-writable `os.tmpdir()` fallback an unpredictable name keeps a
    // local user from pre-positioning and connecting).
    const socketDir = defaultSocketDir(env);
    let socketPath;
    if (typeof opts.socketPath === 'string') {
      socketPath = nodePath.resolve(opts.socketPath);
      const rel = nodePath.relative(socketDir, socketPath);
      if (rel === '' || rel.startsWith('..') || nodePath.isAbsolute(rel)) {
        throw makeError(
          X`socketPath must be inside the socket directory ${q(socketDir)}; got ${q(opts.socketPath)}`,
        );
      }
    } else {
      socketPath = nodePath.join(
        socketDir,
        `endo-9p-${process.pid}-${mountCounter}-${randomBytes(9).toString('hex')}.sock`,
      );
    }

    // The program is operator config, not a caller option (see above);
    // reject a caller that tries to choose it.
    if (opts.mountProgram !== undefined || opts.umountProgram !== undefined) {
      throw makeError(
        X`mountProgram/umountProgram are operator configuration (NINEP_SUDO / NINEP_MOUNT_PROGRAM env), not a per-call option`,
      );
    }
    const removeMountPointOnUnmount = opts.removeMountPointOnUnmount === true;
    // Lazy detach (`umount -l`) so an unattended teardown can release a
    // busy mount instead of leaving a live mount over a dead bridge
    // socket.  Off by default; opt in per-call or via NINEP_LAZY_UMOUNT.
    const lazyUnmount =
      opts.lazyUnmount === true || env.NINEP_LAZY_UMOUNT === '1';

    // 1. Ensure the mount point exists (unless told not to).
    if (opts.makeMountPoint !== false) {
      await makeDir(resolvedMountPoint, { recursive: true });
    }

    // 2. Serve the FS cap on the per-mount UDS.  Thread the caplet's
    //    cancellation in so in-flight 9P dispatchers short-circuit on
    //    teardown rather than blocking on the socket-close cascade.
    const bridge = makeBridge({
      fs,
      socketPath,
      ...(cancelledP ? { cancelled: cancelledP } : {}),
    });
    try {
      await E(bridge).start();
    } catch (cause) {
      // start() may have partially set up (created the net.Server,
      // bound the socket, etc.) before rejecting; stop() so we never
      // leak a half-open listener / socket file.
      await E(bridge)
        .stop()
        .catch(() => {});
      const reason = /** @type {Error} */ (cause).message;
      throw makeError(
        X`9p bridge failed to start on ${q(socketPath)}: ${q(reason)}`,
      );
    }

    // 3. Attach the socket to the kernel.  `trans=unix` is the v9fs
    //    transport that connects to a UNIX-domain socket whose path is
    //    the mount "device" (kernel docs: `mount -t 9p -o trans=unix
    //    /run/9p/srv mnt`).  `version=9p2000.L` is mandatory — the
    //    bridge only speaks the .L dialect.  `--` terminates options so
    //    a socketPath/mountPoint beginning with `-` can't be parsed as
    //    a flag by `mount`.
    const optionString = buildMountOptionString(opts);
    const [mountBin, ...mountPre] = mountProgram;
    const mountArgv = [
      ...mountPre,
      '-t',
      '9p',
      '-o',
      optionString,
      '--',
      socketPath,
      resolvedMountPoint,
    ];
    try {
      await runProgram(mountBin, mountArgv);
    } catch (cause) {
      // Don't leak a listening socket if the mount itself failed.
      await E(bridge)
        .stop()
        .catch(() => {});
      const reason = /** @type {Error} */ (cause).message;
      const stderr = /** @type {{ stderr?: string }} */ (cause).stderr || '';
      throw makeError(
        X`9p mount of ${q(socketPath)} onto ${q(resolvedMountPoint)} failed: ${q(reason)} ${q(stderr)}`,
      );
    }

    let unmounted = false;
    /** @type {Promise<void> | null} */
    let unmountInFlight = null;

    const doUnmount = async () => {
      // Detach the kernel mount FIRST and only commit the rest on
      // success.  If `umount` fails (e.g. EBUSY), we deliberately leave
      // the bridge running and the handle registered: tearing the
      // socket out from under a still-mounted tree would leave a live
      // mount over a dead transport (every I/O then errors).  The
      // caller can free the mount and retry, or pass lazyUnmount.
      const [umountBin, ...umountPre] = umountProgram;
      const umountArgv = [
        ...umountPre,
        ...(lazyUnmount ? ['-l'] : []),
        '--',
        resolvedMountPoint,
      ];
      try {
        await runProgram(umountBin, umountArgv);
      } catch (cause) {
        const reason = /** @type {Error} */ (cause).message;
        const stderr = /** @type {{ stderr?: string }} */ (cause).stderr || '';
        throw makeError(
          X`umount of ${q(resolvedMountPoint)} failed (mount may be busy; retry or pass lazyUnmount): ${q(reason)} ${q(stderr)}`,
        );
      }
      unmounted = true;
      handles.delete(handle);
      await E(bridge)
        .stop()
        .catch(() => {});
      if (removeMountPointOnUnmount) {
        await removeDir(resolvedMountPoint).catch(() => {});
      }
    };

    const handle = makeExo('Fs9pMountHandle', MountHandleInterface, {
      async unmount() {
        if (unmounted) return;
        // Dedupe concurrent callers onto one attempt; on failure clear
        // the latch so a later call can retry.
        if (!unmountInFlight) {
          unmountInFlight = doUnmount().finally(() => {
            unmountInFlight = null;
          });
        }
        await unmountInFlight;
      },
      mountPoint() {
        return resolvedMountPoint;
      },
      socketPath() {
        return socketPath;
      },
      help() {
        return `9P2000.L mount of an endo-fs Filesystem.\n  mountPoint: ${resolvedMountPoint}\n  socket:     ${socketPath}\n  options:    ${optionString}\nCall unmount() to detach and stop the bridge; the caplet also unmounts on teardown.`;
      },
    });
    handles.add(handle);
    // Close the mount-vs-teardown race: if cancellation fired while we
    // were awaiting (makeDir / start / mount), the one-shot teardown
    // sweep ran before this handle was registered and will never run
    // again. `handles.add` and this `cancelled` read are synchronous,
    // so they cannot interleave with the teardown turn (which sets
    // `cancelled` and snapshots `handles` in one turn) — either it
    // already ran (we see `cancelled` and unmount here) or it runs
    // later and sees this handle in the set. `unmount()` is idempotent,
    // so a double with the sweep is harmless.
    if (cancelled) {
      await handle.unmount().catch(() => {});
      throw makeError(
        X`mounter cancelled during mount of ${q(resolvedMountPoint)}`,
      );
    }
    return handle;
  };

  return makeExo('Fs9pMounter', MounterInterface, {
    mount,
    list() {
      return harden([...handles]);
    },
    help() {
      return `endo-fs → 9P mounter.\n  mount(fs, mountPoint, options?) -> MountHandle\nCaller options: { socketPath, msize=131072, cache='none', readOnly=false, extraMountOptions, makeMountPoint=true, removeMountPointOnUnmount=false, lazyUnmount=false }.\nThe trans/version/access options are pinned (extraMountOptions may not override them); the mount/umount program is operator config, not a caller option.\nmount(2) needs CAP_SYS_ADMIN — the operator sets NINEP_SUDO=1 (or NINEP_MOUNT_PROGRAM/NINEP_UMOUNT_PROGRAM) when the daemon is unprivileged.\nunmount() leaves the bridge up if umount fails (EBUSY) so the mount never outlives its transport; lazyUnmount (or NINEP_LAZY_UMOUNT=1) force-detaches a busy mount on teardown.\nEvery live mount is unmounted when this caplet is cancelled.`;
    },
  });
};
harden(makeFsMounter);

/**
 * `make-unconfined` entry point.  Resolves the daemon cancellation
 * context and wires the real Node effects into {@link makeFsMounter}.
 *
 * @param {unknown} _powers - guest powers (unused; mounting uses the
 *   worker's ambient Node authority, which is what `--UNCONFINED`
 *   grants).
 * @param {Promise<any> | any} context - daemon cancellation context.
 * @param {{ env?: Record<string, string> }} [options]
 */
export const make = async (_powers, context, options = {}) => {
  const cancelledP = await resolveCancelled(context);
  return makeFsMounter({
    env: options.env ?? {},
    cancelledP,
    runProgram: execFileP,
    makeDir: mkdir,
    removeDir: rmdir,
    makeBridge: makeFsBridge9p,
  });
};
harden(make);
