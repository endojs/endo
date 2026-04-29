// @ts-check

/* global setTimeout */

import { E } from '@endo/eventual-send';
import { makeError, q, X } from '@endo/errors';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import {
  MountHandleInterface,
  ProcessHandleInterface,
  SandboxFactoryInterface,
  SandboxHandleInterface,
} from './interfaces.js';

const AsyncReaderInterface = M.interface('SandboxReader', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(M.any()).returns(M.promise()),
  throw: M.call().optional(M.any()).returns(M.promise()),
});

const AsyncWriterInterface = M.interface('SandboxWriter', {
  next: M.call().optional(M.any()).returns(M.promise()),
  return: M.call().optional(M.any()).returns(M.promise()),
  throw: M.call().optional(M.any()).returns(M.promise()),
});

/** @import { MakeSandboxFactoryInput, SandboxFactory, SandboxMakeOpts, SandboxDriver, BackendProbe, MountSpec, SliceSpec, MountCap, MountMode, SandboxHandle, ProcessHandle, MountHandle, SpawnOpts, DriverProcess, RootfsSpec } from './types.js' */

const FACTORY_HELP = `\
SandboxFactory — root capability of the @endo/sandbox plugin.

Mints confined POSIX slices via a registered backend driver
(bwrap, podman, lima, …). Phase 1 ships the bwrap driver on Linux.

Methods:
  help([methodName])    Documentation for the factory or a method.
  listBackends()        Probe every registered driver and return the
                        list of { name, available, reason?, version? }.
  make(opts)            Mint a new sandbox slice. See SandboxMakeOpts.
`;

const METHOD_HELP = harden({
  help: 'help([methodName]) — return documentation for the factory or a specific method.',
  listBackends:
    'listBackends() — probe every registered driver. Returns Array<BackendProbe>.',
  make:
    'make(opts) — mint a new SandboxHandle. opts.rootfs is required; ' +
    'opts.network defaults to "none"; opts.backend defaults to "auto".',
});

const HANDLE_HELP = `\
SandboxHandle — a live confined POSIX slice.

Pinned by the formula that minted it. When dropped, every
ProcessHandle is killed and every MountHandle is unmounted before the
driver tears down the underlying namespace.

Methods:
  spawn(argv, opts)   Spawn a process in the slice.
  mount(cap, …)       Bind a Mount capability into the slice.
  scratch(innerPath)  Mint an ephemeral scratch mount.
  open(innerPath)     Open a single file inside the slice.
  fork(opts)          Mint a nested sub-slice (Phase 3).
  reset()             Tear down processes / scratch, keep mounts.
  dispose()           Full teardown.
`;

const PROCESS_HELP = `\
ProcessHandle — a process running inside a slice.

Stdio uses Endo's reader-ref / writer-ref plumbing.

Methods:
  pid()               Pid as observed inside the slice.
  stdin/stdout/stderr Stdio refs (when captured).
  wait()              Resolves with { code, signal }.
  kill(signal?)       Forward a signal to the process.
`;

const MOUNT_HELP = `\
MountHandle — a mount bound into a slice.

Methods:
  innerPath()  Path inside the slice.
  cap()        Back-reference to the original Mount capability.
  mode()       'ro' or 'rw'.
  unmount()    Detach the mount from the slice.
`;

const KILL_GRACE_MS = 5_000;

/**
 * Wrap a driver-side `AsyncIterable<Uint8Array>` as a `ReaderRef`-
 * shaped exo. The factory minimally implements the AsyncIterator
 * protocol the daemon's `reader-ref.js` uses (`next` / `return` /
 * `throw`).
 *
 * @param {AsyncIterable<Uint8Array> | null | undefined} iterable
 * @returns {object}
 */
const makeReaderExoFromAsyncIterable = iterable => {
  /** @type {AsyncIterator<Uint8Array> | null} */
  let iterator = null;
  if (iterable !== undefined && iterable !== null) {
    iterator = iterable[Symbol.asyncIterator]();
  }
  return makeExo('SandboxReader', AsyncReaderInterface, {
    async next() {
      await null;
      if (iterator === null) return harden({ done: true, value: undefined });
      const r = await iterator.next();
      if (r.done) return harden({ done: true, value: undefined });
      const value = r.value;
      // Some Node streams yield Buffers; normalise to Uint8Array so
      // downstream readers see a stable type.
      const u8 =
        value instanceof Uint8Array
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : new Uint8Array(value);
      return harden({ done: false, value: u8 });
    },
    async return(value) {
      await null;
      if (iterator !== null && iterator.return !== undefined) {
        const r = await iterator.return(value);
        return harden({ done: true, value: r.value });
      }
      return harden({ done: true, value: undefined });
    },
    async throw(error) {
      await null;
      if (iterator !== null && iterator.throw !== undefined) {
        return iterator.throw(error);
      }
      throw error;
    },
  });
};
harden(makeReaderExoFromAsyncIterable);

/**
 * Wrap driver-side stdin write closures as a `WriterRef`-shaped exo.
 * The driver exposes `writeStdin(chunk)` / `closeStdin()` instead of
 * the raw Node stream so the DriverProcess surface remains hardenable
 * (Node streams cannot be deep-frozen).
 *
 * @param {(chunk: Uint8Array) => Promise<void>} [write]
 * @param {() => Promise<void>} [close]
 * @returns {object}
 */
const makeWriterExoFromClosures = (write, close) => {
  return makeExo('SandboxWriter', AsyncWriterInterface, {
    /** @param {Uint8Array} [chunk] */
    async next(chunk) {
      await null;
      if (write === undefined || chunk === undefined) {
        return harden({ done: true, value: undefined });
      }
      await write(chunk);
      return harden({ done: false, value: undefined });
    },
    async return() {
      await null;
      if (close !== undefined) await close();
      return harden({ done: true, value: undefined });
    },
    async throw(error) {
      await null;
      throw error;
    },
  });
};
harden(makeWriterExoFromClosures);

/**
 * Resolve a `Mount` capability to a host filesystem path via the
 * `provideHostPath` power. Throws a structured error when the power
 * is missing or when the resolution fails.
 *
 * @param {any} scratchProvider
 * @param {MountCap} cap
 * @param {string} context
 * @returns {Promise<string>}
 */
const resolveHostPath = async (scratchProvider, cap, context) => {
  await null;
  // Always go through eventual-send.  This works for both local
  // record-shaped powers and remote refs, and lets us treat the
  // resolution failure as a structured error consistently.
  try {
    return await E(scratchProvider).provideHostPath(cap);
  } catch (e) {
    throw makeError(
      X`failed to resolve mount cap for ${q(context)}: ${q(/** @type {Error} */ (e).message)}`,
    );
  }
};

/**
 * Phase 1 factory.
 *
 * @param {MakeSandboxFactoryInput} input
 * @returns {SandboxFactory}
 */
export const makeSandboxFactory = ({ drivers, scratchProvider }) => {
  const driverList = harden([...drivers]);

  /**
   * @returns {Promise<BackendProbe[]>}
   */
  const listBackends = async () => {
    /** @type {BackendProbe[]} */
    const probes = [];
    for (const driver of driverList) {
      // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
      const result = await driver.probe().then(
        r => harden({ ok: /** @type {const} */ (true), value: r }),
        e => harden({ ok: /** @type {const} */ (false), error: e }),
      );
      if (result.ok) {
        probes.push(harden({ name: driver.name, ...result.value }));
      } else {
        const reason =
          /** @type {Error} */ (result.error).message || String(result.error);
        probes.push(harden({ name: driver.name, available: false, reason }));
      }
    }
    return harden(probes);
  };

  /**
   * @param {SandboxMakeOpts['backend']} selector
   * @returns {SandboxDriver | undefined}
   */
  const pickDriver = selector => {
    if (driverList.length === 0) return undefined;
    if (selector === undefined || selector === 'auto') {
      return driverList[0];
    }
    return driverList.find(d => d.name === selector);
  };

  /**
   * Resolve the `RootfsSpec` to a driver-friendly shape.
   *
   * @param {RootfsSpec} rootfs
   * @returns {Promise<SliceSpec['rootfs']>}
   */
  const resolveRootfs = async rootfs => {
    if (
      typeof rootfs === 'object' &&
      rootfs !== null &&
      'kind' in rootfs &&
      (rootfs.kind === 'host-bind' || rootfs.kind === 'minimal')
    ) {
      return harden({ kind: rootfs.kind });
    }
    // Otherwise treat it as a Mount cap.
    const hostPath = await resolveHostPath(
      scratchProvider,
      /** @type {MountCap} */ (rootfs),
      'rootfs',
    );
    return harden({ kind: 'mount', hostPath, mode: 'ro' });
  };

  /**
   * @param {MountSpec} mount
   * @returns {Promise<{ hostPath: string; innerPath: string; mode: MountMode }>}
   */
  const resolveMount = async mount => {
    const hostPath = await resolveHostPath(
      scratchProvider,
      mount.cap,
      `mount ${mount.innerPath}`,
    );
    return harden({
      hostPath,
      innerPath: mount.innerPath,
      mode: /** @type {MountMode} */ (mount.mode ?? 'ro'),
    });
  };

  /**
   * Acquire a writable scratch host path. Tries `provideHostPath`
   * against a freshly minted scratch mount; if the powers cannot
   * resolve it, falls back to a daemon-side scratch path string when
   * the powers expose one. Phase 1 supports both pathways so tests
   * can supply a real tmpdir without round-tripping through a Mount
   * cap.
   *
   * @returns {Promise<string>}
   */
  const acquireScratchHostPath = async () => {
    await null;
    // Preferred path: mint a scratch mount and resolve it via
    // `provideHostPath`.
    try {
      const scratchCap =
        await E(scratchProvider).provideScratchMount('sandbox-scratch');
      return await resolveHostPath(
        scratchProvider,
        /** @type {MountCap} */ (scratchCap),
        'scratch upper layer',
      );
    } catch (e) {
      throw makeError(
        X`could not allocate sandbox scratch host path: ${q(/** @type {Error} */ (e).message)}`,
      );
    }
  };

  /**
   * @param {SandboxMakeOpts} opts
   * @returns {Promise<SandboxHandle>}
   */
  const make = async opts => {
    const selector = opts.backend ?? 'auto';
    const driver = pickDriver(selector);
    if (driver === undefined) {
      throw makeError(X`no backend available: ${q(selector)}`);
    }

    // Resolve everything that requires the privileged
    // `provideHostPath` power up front. Drivers never see Mount caps.
    const rootfs = await resolveRootfs(opts.rootfs);
    const mountSpecs = opts.mounts ?? [];
    const resolvedMounts = await Promise.all(mountSpecs.map(resolveMount));
    let scratchHostPath = '';
    try {
      scratchHostPath = await acquireScratchHostPath();
    } catch (e) {
      // Scratch is optional in Phase 1 — some callers may want a
      // pure read-only slice. Re-throw only if we actually need it
      // (e.g. minimal rootfs with no mounts).
      if (rootfs.kind === 'minimal' && resolvedMounts.length === 0) {
        throw e;
      }
      // Otherwise leave scratchHostPath empty; the driver skips the
      // scratch bind when the path is empty.
    }

    /** @type {SliceSpec} */
    const sliceSpec = harden({
      rootfs,
      mounts: harden(resolvedMounts),
      scratchHostPath,
      network: opts.network ?? 'none',
      seccomp: opts.seccomp ?? 'default',
      env: harden({ ...(opts.env ?? {}) }),
      cwd: opts.cwd,
    });

    const driverSlice = await driver.prepareSlice(sliceSpec);

    /** @type {Set<{ proc: import('child_process').ChildProcess | undefined; driverProc: DriverProcess; processHandle: ProcessHandle }>} */
    const liveProcesses = new Set();
    /** @type {Set<MountHandle>} */
    const liveMounts = new Set();
    let disposed = false;

    /**
     * @param {string[]} argv
     * @param {SpawnOpts} [spawnOpts]
     * @returns {Promise<ProcessHandle>}
     */
    const spawnProc = async (argv, spawnOpts = {}) => {
      if (disposed) {
        throw makeError(X`sandbox handle has been disposed`);
      }
      const driverProc = await driver.spawn(driverSlice, argv, spawnOpts);

      const stdoutRef = makeReaderExoFromAsyncIterable(
        spawnOpts.captureStdout === false
          ? undefined
          : /** @type {AsyncIterable<Uint8Array> | null} */ (
              driverProc.stdout ?? undefined
            ),
      );
      const stderrRef = makeReaderExoFromAsyncIterable(
        spawnOpts.captureStderr === false
          ? undefined
          : /** @type {AsyncIterable<Uint8Array> | null} */ (
              driverProc.stderr ?? undefined
            ),
      );

      // The driver exposes `writeStdin` / `closeStdin` closures (see
      // drivers/bwrap.js) so the writer adapter does not need to
      // touch the raw Node stream.
      const extDriverProc =
        /** @type {{ writeStdin?: (chunk: Uint8Array) => Promise<void>; closeStdin?: () => Promise<void> }} */ (
          /** @type {any} */ (driverProc)
        );
      const stdinRef = makeWriterExoFromClosures(
        extDriverProc.writeStdin,
        extDriverProc.closeStdin,
      );

      /** @type {ProcessHandle} */
      const procHandle = /** @type {any} */ (
        makeExo('SandboxProcess', ProcessHandleInterface, {
          help: () => PROCESS_HELP,
          pid: () => driverProc.pid,
          stdin: () => stdinRef,
          stdout: () => stdoutRef,
          stderr: () => stderrRef,
          wait: () => driverProc.wait(),
          kill: async signal => {
            await driverProc.kill(signal);
          },
        })
      );

      const entry = {
        proc: undefined,
        driverProc,
        processHandle: procHandle,
      };
      liveProcesses.add(entry);
      driverProc.wait().finally(() => liveProcesses.delete(entry));
      return procHandle;
    };

    /**
     * @param {MountCap} cap
     * @param {string} innerPath
     * @param {MountMode} [mode]
     * @returns {MountHandle}
     */
    const makeMountHandle = (cap, innerPath, mode = 'ro') => {
      let unmounted = false;
      /** @type {MountHandle} */
      const m = /** @type {any} */ (
        makeExo('SandboxMount', /** @type {any} */ (MountHandleInterface), {
          help: () => MOUNT_HELP,
          innerPath: () => innerPath,
          cap: () => /** @type {any} */ (cap),
          mode: () => mode,
          unmount: async () => {
            unmounted = true;
            liveMounts.delete(m);
          },
        })
      );
      void unmounted;
      liveMounts.add(m);
      return m;
    };

    /**
     * @param {MountCap} cap
     * @param {string} innerPath
     * @param {MountMode} [mode]
     */
    const mountInSlice = async (cap, innerPath, mode = 'ro') => {
      if (disposed) throw makeError(X`sandbox handle has been disposed`);
      // Phase 1 only supports mounts declared at slice construction;
      // dynamic mounts after the fact would require remounting bwrap.
      // We still mint a tracker so dispose() can iterate.
      return makeMountHandle(cap, innerPath, mode);
    };

    /**
     * @param {string} innerPath
     */
    const scratchInSlice = async innerPath => {
      if (disposed) throw makeError(X`sandbox handle has been disposed`);
      // Lifecycle is bound to the slice; the daemon's scratch GC
      // sweeps the host directory when the cap is unpinned.
      const scratchCap = /** @type {MountCap} */ (
        await E(scratchProvider).provideScratchMount(
          `sandbox-scratch-${innerPath.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        )
      );
      return makeMountHandle(scratchCap, innerPath, 'rw');
    };

    /**
     * @param {string} innerPath
     */
    const openInSlice = async innerPath => {
      throw makeError(
        X`open(${q(innerPath)}) requires a ReadableFile cap from the slice driver; not implemented before Phase 2`,
      );
    };

    const forkSlice = async () => {
      throw makeError(X`fork not implemented before Phase 3`);
    };

    const resetSlice = async () => {
      // Kill all processes; keep mounts.
      const reaps = [];
      for (const entry of liveProcesses) {
        reaps.push(entry.driverProc.kill('SIGTERM'));
      }
      await Promise.all(reaps);
    };

    const disposeSlice = async () => {
      await null;
      if (disposed) return;
      disposed = true;

      // SIGTERM every live process in parallel.
      const procs = [...liveProcesses];
      await Promise.all(
        procs.map(entry =>
          // eslint-disable-next-line no-empty-function
          entry.driverProc.kill('SIGTERM').catch(() => {}),
        ),
      );

      // Wait up to KILL_GRACE_MS for graceful shutdown, then SIGKILL.
      const graceTimer = new Promise(resolve =>
        setTimeout(resolve, KILL_GRACE_MS),
      );
      await Promise.race([
        Promise.all(procs.map(e => e.driverProc.wait().catch(() => null))),
        graceTimer,
      ]);
      await Promise.all(
        procs
          .filter(entry => liveProcesses.has(entry))
          .map(entry =>
            // eslint-disable-next-line no-empty-function
            entry.driverProc.kill('SIGKILL').catch(() => {}),
          ),
      );

      // Unmount any tracked mounts in parallel.
      await Promise.all(
        // eslint-disable-next-line no-empty-function
        [...liveMounts].map(m =>
          E(m)
            .unmount()
            .catch(() => {}),
        ),
      );

      await driver.teardown(driverSlice);
    };

    /** @type {SandboxHandle} */
    const handle = /** @type {any} */ (
      makeExo('SandboxHandle', SandboxHandleInterface, {
        help: () => HANDLE_HELP,
        spawn: spawnProc,
        mount: mountInSlice,
        scratch: scratchInSlice,
        open: openInSlice,
        fork: forkSlice,
        reset: resetSlice,
        dispose: disposeSlice,
      })
    );

    return handle;
  };

  /**
   * @param {string} [methodName]
   * @returns {string}
   */
  const help = methodName => {
    if (methodName === undefined) return FACTORY_HELP;
    const text =
      METHOD_HELP[/** @type {keyof typeof METHOD_HELP} */ (methodName)];
    if (text === undefined) {
      return `No documentation for method ${q(methodName)}.`;
    }
    return text;
  };

  return /** @type {SandboxFactory} */ (
    /** @type {unknown} */ (
      makeExo('SandboxFactory', SandboxFactoryInterface, {
        help,
        listBackends,
        make,
      })
    )
  );
};
harden(makeSandboxFactory);
