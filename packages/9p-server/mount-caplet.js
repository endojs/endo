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
  mount: M.call(M.any(), M.string()).optional(M.any()).returns(M.promise()),
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
 * Build the comma-separated `-o` value for `mount -t 9p`.
 *
 * @param {Record<string, unknown>} options
 */
const buildMountOptionString = options => {
  const {
    trans = 'unix',
    version = '9p2000.L',
    msize = 512_000,
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
 * `make-unconfined` entry point.
 *
 * @param {unknown} _powers - guest powers (unused; mounting uses the
 *   worker's ambient Node authority, which is what `--UNCONFINED`
 *   grants).
 * @param {Promise<any> | any} context - daemon cancellation context.
 * @param {{ env?: Record<string, string> }} [options]
 */
export const make = async (_powers, context, options = {}) => {
  const env = options.env ?? {};

  // Cancellation context → unmount-everything trigger.  `whenCancelled`
  // rejects on teardown, so wire both settlement paths to the sweeper.
  const cancelledP = await resolveCancelled(context);

  /** @type {Set<{ unmount: () => Promise<void> }>} */
  const handles = new Set();

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
    Promise.resolve(cancelledP).then(unmountAll, unmountAll);
  }

  /**
   * @param {ERef<any>} fs - endo-fs `Filesystem` capability to project.
   * @param {string} mountPoint - host path to mount onto.
   * @param {Record<string, unknown>} [mountOptions]
   */
  const mount = async (fs, mountPoint, mountOptions = {}) => {
    const resolvedMountPoint = nodePath.resolve(mountPoint);
    const socketPath =
      typeof mountOptions.socketPath === 'string'
        ? mountOptions.socketPath
        : nodePath.join(
            defaultSocketDir(env),
            `endo-9p-${process.pid}-${handles.size}-${Date.now()}.sock`,
          );

    const sudo = env.NINEP_SUDO === '1';
    const mountProgram = Array.isArray(mountOptions.mountProgram)
      ? mountOptions.mountProgram.map(String)
      : sudo
        ? ['sudo', 'mount']
        : ['mount'];
    const umountProgram = Array.isArray(mountOptions.umountProgram)
      ? mountOptions.umountProgram.map(String)
      : sudo
        ? ['sudo', 'umount']
        : ['umount'];
    const removeMountPointOnUnmount =
      mountOptions.removeMountPointOnUnmount === true;

    // 1. Ensure the mount point exists (unless told not to).
    if (mountOptions.makeMountPoint !== false) {
      await mkdir(resolvedMountPoint, { recursive: true });
    }

    // 2. Serve the FS cap on the per-mount UDS.  Thread the caplet's
    //    cancellation in so in-flight 9P dispatchers short-circuit on
    //    teardown rather than blocking on the socket-close cascade.
    const bridge = makeFsBridge9p({
      fs,
      socketPath,
      ...(cancelledP ? { cancelled: cancelledP } : {}),
    });
    await E(bridge).start();

    // 3. Attach the socket to the kernel.  `trans=unix` makes v9fs's
    //    fd transport connect to the UDS named by the mount "device"
    //    (the socket path).  `version=9p2000.L` is mandatory — the
    //    bridge only speaks the .L dialect.
    const optionString = buildMountOptionString(mountOptions);
    const [mountBin, ...mountPre] = mountProgram;
    const mountArgv = [
      ...mountPre,
      '-t',
      '9p',
      '-o',
      optionString,
      socketPath,
      resolvedMountPoint,
    ];
    try {
      await execFileP(mountBin, mountArgv);
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
    const handle = makeExo('Fs9pMountHandle', MountHandleInterface, {
      async unmount() {
        if (unmounted) return;
        unmounted = true;
        handles.delete(handle);
        // Detach the kernel mount first so no process is mid-syscall
        // against the bridge when we tear the socket down.
        const [umountBin, ...umountPre] = umountProgram;
        await execFileP(umountBin, [...umountPre, resolvedMountPoint]).catch(
          err => {
            // eslint-disable-next-line no-console
            console.error(
              `[9p mount-caplet] umount ${resolvedMountPoint} failed`,
              err,
            );
          },
        );
        await E(bridge)
          .stop()
          .catch(() => {});
        if (removeMountPointOnUnmount) {
          await rmdir(resolvedMountPoint).catch(() => {});
        }
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
    return handle;
  };

  return makeExo('Fs9pMounter', MounterInterface, {
    mount,
    list() {
      return harden([...handles]);
    },
    help() {
      return `endo-fs → 9P mounter.\n  mount(fs, mountPoint, options?) -> MountHandle\nOptions: { socketPath, trans='unix', version='9p2000.L', msize=512000, access='any', cache='none', readOnly=false, extraMountOptions, mountProgram, umountProgram, makeMountPoint=true, removeMountPointOnUnmount=false }.\nmount(2) needs CAP_SYS_ADMIN — pass mountProgram:['sudo','mount'] or set NINEP_SUDO=1 when the daemon is unprivileged.\nEvery live mount is unmounted when this caplet is cancelled.`;
    },
  });
};
harden(make);
