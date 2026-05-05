// @ts-check

/**
 * Slice-backed {@link Spawner} adapter.
 *
 * Wraps a `SandboxHandle` (from `@endo/sandbox/factory.js`) so the
 * `bash` / `exec` / `git` command tools can spawn through
 * `E(handle).spawn(argv, opts)` instead of `child_process.spawn`.
 *
 * The adapter bridges the slice's CapTP-shaped `ProcessHandle` —
 * which exposes `ReaderRef` / `WriterRef` exos for stdio — into the
 * {@link ProcessLike} surface `runProcess` (in `./command.js`)
 * already drains.  That keeps the timeout / kill / output-
 * accumulation loop uniform across host and slice spawners.
 *
 * The adapter also normalises the `shell: true` flag the host
 * spawner forwards to Node's `child_process.spawn`: a slice has no
 * "shell" knob, so we translate it into an explicit
 * `['/bin/sh', '-c', joined]` invocation inside the slice.  Callers
 * that want a different shell (e.g. busybox's `ash`) can pre-wrap
 * argv themselves and pass `shell: false`.
 */

import { E } from '@endo/eventual-send';
import { makeError, q, X } from '@endo/errors';
import harden from '@endo/harden';

/** @import { Spawner, ProcessLike } from './spawner.js' */

/**
 * Sub-shape of `@endo/sandbox`'s `SandboxHandle` that the spawner
 * actually exercises.  Captured here as a structural type so this
 * module does not need a runtime dependency on `@endo/sandbox` —
 * callers pass any object whose `spawn` method matches the slice
 * contract.
 *
 * @typedef {object} SandboxHandleLike
 * @property {(argv: string[], opts?: SandboxSpawnOpts) => Promise<SandboxProcessLike>} spawn
 */

/**
 * Per-spawn options forwarded to `E(handle).spawn`.  Mirrors a
 * subset of `SpawnOpts` from `@endo/sandbox/types.d.ts`.
 *
 * @typedef {object} SandboxSpawnOpts
 * @property {string} [cwd]
 * @property {Record<string, string | undefined>} [env]
 * @property {boolean} [captureStdout]
 * @property {boolean} [captureStderr]
 */

/**
 * Sub-shape of `@endo/sandbox`'s `ProcessHandle` (its `ReaderRef`
 * exos) the spawner consumes.  See `factory.js` `makeReaderExoFrom-
 * AsyncIterable` for the full contract.
 *
 * @typedef {object} ReaderRefLike
 * @property {() => Promise<{ done: boolean; value: Uint8Array | undefined }>} next
 * @property {(value?: any) => Promise<{ done: boolean; value?: any }>} [return]
 */

/**
 * @typedef {object} SandboxProcessLike
 * @property {() => number | Promise<number>} pid
 * @property {() => ReaderRefLike} stdout
 * @property {() => ReaderRefLike} stderr
 * @property {() => Promise<{ code: number | null; signal: string | null }>} wait
 * @property {(signal?: string | number) => Promise<void>} kill
 */

/**
 * Adapt a `ReaderRef`-shaped exo into an `AsyncIterable<Uint8Array>`
 * the host's drain loop can consume.  Calls `E(reader).next()`
 * eventually, yields the byte chunk, and stops when `done` is true.
 *
 * Errors from the remote `next()` call propagate as iterator
 * exceptions; `runProcess` (in `./command.js`) swallows them so a
 * mid-stream kill surfaces as clean EOF rather than a tool error.
 *
 * @param {ReaderRefLike} readerRef
 * @returns {AsyncIterable<Uint8Array>}
 */
const readerRefToAsyncIterable = readerRef => {
  return harden({
    async *[Symbol.asyncIterator]() {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const step = await E(readerRef).next();
        if (step.done) return;
        if (step.value !== undefined) {
          yield step.value;
        }
      }
    },
  });
};

/**
 * Build a {@link Spawner} that forwards every spawn to a sandbox
 * slice via `E(handle).spawn`.
 *
 * The adapter eagerly reads the slice's `pid` so the returned
 * {@link ProcessLike} has a sync `pid` field matching the host
 * spawner's contract.  All other slice operations remain eventual.
 *
 * @param {object} options
 * @param {SandboxHandleLike} options.handle - SandboxHandle (or any
 *   object with a matching `spawn` method).  Typically obtained from
 *   `E(sandboxFactory).make(...)` at genie startup.
 * @returns {Spawner}
 */
export const makeSandboxSpawner = ({ handle }) => {
  if (handle === undefined || handle === null) {
    throw makeError(X`makeSandboxSpawner: handle is required`);
  }

  /** @type {Spawner} */
  const spawn = async (argv, opts = {}) => {
    if (!Array.isArray(argv) || argv.length === 0) {
      throw makeError(
        X`sandbox spawner: argv must be a non-empty string array, got ${q(argv)}`,
      );
    }

    // Translate `shell: true` into an explicit shell invocation
    // inside the slice.  The slice has no "shell" knob — Node's
    // `child_process.spawn` shell wrapping is host-only — so we run
    // `/bin/sh -c "<joined argv>"` to match the host semantics.
    const sliceArgv = opts.shell ? ['/bin/sh', '-c', argv.join(' ')] : argv;

    /** @type {SandboxSpawnOpts} */
    const sliceOpts = {
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      ...(opts.env !== undefined ? { env: { ...opts.env } } : {}),
      captureStdout: true,
      captureStderr: true,
    };

    const procHandle = await E(handle).spawn(sliceArgv, sliceOpts);

    // Pid is sync on the host ProcessLike; resolve it eagerly so the
    // host and sandbox shapes match.
    let pid = 0;
    try {
      pid = await E(procHandle).pid();
    } catch {
      // Best-effort: a stub or lightweight ProcessHandle may not
      // expose pid.  Fall through with 0.
    }

    const stdoutRef = await E(procHandle).stdout();
    const stderrRef = await E(procHandle).stderr();

    /** @type {ProcessLike} */
    const proc = harden({
      pid,
      stdout: readerRefToAsyncIterable(stdoutRef),
      stderr: readerRefToAsyncIterable(stderrRef),
      wait: () => E(procHandle).wait(),
      /** @param {string | number} [signal] */
      kill: async signal => {
        await E(procHandle).kill(signal);
      },
    });
    return proc;
  };
  return harden(spawn);
};
harden(makeSandboxSpawner);
