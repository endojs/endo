// @ts-check
/* global process */

/**
 * Spawner abstraction for the `bash` / `exec` / `git` command tools.
 *
 * `makeCommandTool` (see `./command.js`) historically called
 * `child_process.spawn` directly inside its `execute` body.  For the
 * workspace-as-slice integration the daemon-hosted genie needs the
 * same tools to spawn through a `SandboxHandle.spawn(argv, opts)`
 * instead, while the dev-repl and any future host-only deployment
 * keep the direct-spawn behaviour.
 *
 * The abstraction here is the seam that lets us swap engines:
 *
 *   - {@link Spawner} — a single-method interface (`spawn(argv, opts)`)
 *     returning a {@link ProcessLike}.  The shape mirrors
 *     `DriverProcess` from `@endo/sandbox/types.d.ts` so a slice's
 *     `ProcessHandle` can drop in via a thin adapter (see
 *     `./sandbox-spawner.js`).
 *   - {@link makeHostSpawner} — the default host implementation that
 *     wraps `child_process.spawn` with the same `searchPath` / env
 *     handling the original `makeCommandTool` body had.  The
 *     timeout / kill / output-accumulation loop deliberately lives in
 *     `makeCommandTool` itself so it stays uniform across spawners.
 *
 * The async-iterable stdout / stderr surface keeps the contract
 * uniform: both the host (`child_process` event streams) and the
 * sandbox (`ReaderRef`-shaped exos) can be drained with a single
 * `for await` loop.
 */

import { spawn as childSpawn } from 'child_process';
import * as fs from 'fs';
import { join } from 'path';

import harden from '@endo/harden';

/**
 * Per-spawn options accepted by a {@link Spawner}.  Intentionally a
 * subset of `SpawnOpts` from `@endo/sandbox/types.d.ts` plus the
 * `shell` flag that the host spawner honours via Node's built-in
 * shell-wrapping behaviour.
 *
 * @typedef {object} SpawnerOpts
 * @property {string} [cwd]
 *   Working directory for the child process.  Resolved against the
 *   spawner's execution context (host fs for the host spawner; the
 *   slice's filesystem for the sandbox spawner).
 * @property {Record<string, string>} [env]
 *   Environment variables for the child.  Spawners merge these on top
 *   of their default environment (host process env, slice env, etc.).
 * @property {boolean} [shell]
 *   If true, run the argv through a system shell.  The host spawner
 *   forwards this to Node's `child_process.spawn`; the sandbox
 *   spawner translates it into an explicit `['/bin/sh', '-c', ...]`
 *   invocation inside the slice.
 */

/**
 * Runtime shape returned by a {@link Spawner}.  Mirrors
 * `DriverProcess` from `@endo/sandbox/types.d.ts` so sandbox slices'
 * `ProcessHandle`s drop in.  Stdout / stderr are async-iterables
 * yielding raw bytes; the consuming `makeCommandTool` body decodes
 * them as UTF-8 strings.
 *
 * @typedef {object} ProcessLike
 * @property {number} pid
 *   Pid as observed by the spawner's runtime.  The host spawner
 *   reports the host pid; the sandbox spawner reports the pid inside
 *   the slice's pid namespace.  May be `0` when the runtime cannot
 *   surface a pid (e.g. a stub used in tests).
 * @property {AsyncIterable<Uint8Array> | null | undefined} [stdout]
 *   Stdout byte stream.  `null` / `undefined` denotes "not captured".
 * @property {AsyncIterable<Uint8Array> | null | undefined} [stderr]
 *   Stderr byte stream.  `null` / `undefined` denotes "not captured".
 * @property {() => Promise<{ code: number | null; signal: string | null }>} wait
 *   Resolves with the exit status when the process terminates.
 * @property {(signal?: string | number) => Promise<void>} kill
 *   Send a signal to the process (defaults to `SIGTERM`).
 */

/**
 * A function that spawns a process and returns a {@link ProcessLike}.
 *
 * Implementations must return promptly (they should not wait for the
 * child to exit) so the caller can install timeout / kill plumbing
 * around the returned handle.
 *
 * @callback Spawner
 * @param {string[]} argv
 *   Full argv, including the program name as `argv[0]`.  Spawners
 *   resolve `argv[0]` against their own runtime PATH conventions.
 * @param {SpawnerOpts} [opts]
 * @returns {Promise<ProcessLike>}
 */

// ---------------------------------------------------------------------------
// Default host spawner
// ---------------------------------------------------------------------------

/**
 * Resolve a program name against a colon-separated PATH-like string,
 * checking that the candidate file exists and is executable.  Returns
 * the absolute path on success, or `null` when the program cannot be
 * located.
 *
 * Mirrors the `whichProgram` helper that previously lived inline in
 * `makeCommandTool`.  Pulled out here so the host spawner can reuse
 * it without duplicating the logic.
 *
 * @param {string} prog
 * @param {string} searchPath
 */
const whichProgram = async (prog, searchPath) => {
  await Promise.resolve();
  const isWin = process.platform === 'win32';
  const pathDirs = searchPath.split(isWin ? ';' : ':');
  for (const dir of pathDirs) {
    // eslint-disable-next-line no-continue
    if (!dir) continue;
    const candidate = join(dir, prog);
    try {
      // eslint-disable-next-line no-await-in-loop
      const stats = await fs.promises.stat(candidate);
      // eslint-disable-next-line no-bitwise
      if (isWin ? stats.isFile() : (stats.mode & 0o111) !== 0) {
        return candidate;
      }
    } catch {
      // not found in this dir
    }
  }
  return null;
};
harden(whichProgram);

/**
 * Adapt a Node `Readable` stream into an `AsyncIterable<Uint8Array>`
 * matching the sandbox `DriverProcess` contract.  Node's `Readable`
 * already implements `Symbol.asyncIterator` natively; we wrap it so
 * the type narrows cleanly and chunks are normalised to `Uint8Array`
 * (Node yields `Buffer` by default, which is a `Uint8Array` subclass
 * but is not deep-frozen / hardenable).
 *
 * @param {NodeJS.ReadableStream | null} stream
 * @returns {AsyncIterable<Uint8Array> | null}
 */
const readableToAsyncIterable = stream => {
  if (stream === null || stream === undefined) return null;
  return harden({
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        if (chunk instanceof Uint8Array) {
          yield new Uint8Array(
            chunk.buffer,
            chunk.byteOffset,
            chunk.byteLength,
          );
        } else {
          yield new TextEncoder().encode(String(chunk));
        }
      }
    },
  });
};

/**
 * Build the default host-side {@link Spawner}.  Wraps
 * `child_process.spawn` while exposing the same async-iterable
 * stdout / stderr surface the sandbox spawner produces.
 *
 * The host spawner does *not* implement timeout / kill itself; the
 * caller (`makeCommandTool`) layers that behaviour on top of the
 * returned {@link ProcessLike} so it stays uniform across spawners.
 *
 * @param {object} [options]
 * @param {string} [options.searchPath]
 *   Colon-separated PATH used to resolve `argv[0]`.  Defaults to
 *   `process.env.PATH`.
 * @param {Record<string, string | undefined>} [options.defaultEnv]
 *   Base environment merged into every spawn call.  Defaults to
 *   `process.env`.
 * @returns {Spawner}
 */
export const makeHostSpawner = ({
  searchPath = process.env.PATH || '',
  defaultEnv = process.env,
} = {}) => {
  /** @type {Spawner} */
  const spawn = async (argv, opts = {}) => {
    if (!Array.isArray(argv) || argv.length === 0) {
      throw new Error('host spawner: argv must be a non-empty string array');
    }
    const useShell = opts.shell ?? false;

    /** @type {string} */
    let exe;
    /** @type {string[]} */
    let restArgs;

    if (useShell) {
      // In shell mode we treat the entire argv as a single shell
      // command line (joined with spaces), matching the sandbox
      // spawner's `['/bin/sh', '-c', argv.join(' ')]` shape and the
      // way LLMs typically use the `bash` tool — they routinely emit a
      // single-string `args: ["ls -F"]` payload because they think of
      // bash as taking a command, not an argv list.  We let the
      // underlying shell handle program resolution rather than
      // `whichProgram`-checking the first whitespace-delimited token,
      // because that would (a) be wrong for argv-shaped payloads
      // (`args: ["ls", "-F"]` would treat `ls` as the literal first
      // token) and (b) re-introduce the silent failure mode reported
      // in TODO/57 where `args: ["ls -F"]` failed with "command not
      // found: ls -F" before the shell ever got a look.
      //
      // Node's `child_process.spawn(cmd, args, { shell: true })`
      // concatenates `cmd` and `args` with spaces and runs the result
      // as `/bin/sh -c <joined>`, so passing the full argv as the
      // `cmd` string with an empty `args` array reaches the shell
      // verbatim regardless of how the model split its tokens.
      exe = argv.join(' ');
      restArgs = [];
    } else {
      const [prog, ...rest] = argv;
      // PATH lookup mirrors the original `whichProgram` behaviour so
      // the pre-existing "command not found" error message is
      // preserved on the non-shell path (the `exec` tool, mostly).
      const resolved = await whichProgram(prog, searchPath);
      if (resolved === null) {
        throw new Error(`command not found: ${prog}`);
      }
      exe = resolved;
      restArgs = rest;
    }

    const child = childSpawn(exe, restArgs, {
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
      env: {
        ...defaultEnv,
        ...(opts.env ?? {}),
        // Preserve PATH explicitly so a caller-supplied `env` that
        // omits PATH does not break the child.
        PATH: (opts.env && opts.env.PATH) || defaultEnv.PATH,
      },
      shell: useShell,
    });

    /** @type {Promise<{ code: number | null; signal: string | null }>} */
    const exited = new Promise((resolve, reject) => {
      child.on('error', err => reject(err));
      child.on('close', (code, signal) => {
        resolve(harden({ code, signal }));
      });
    });

    return harden({
      pid: child.pid ?? 0,
      stdout: readableToAsyncIterable(child.stdout),
      stderr: readableToAsyncIterable(child.stderr),
      wait: () => exited,
      /** @param {string | number} [signal] */
      kill: async signal => {
        await null;
        child.kill(/** @type {NodeJS.Signals | number | undefined} */ (signal));
      },
    });
  };
  return harden(spawn);
};
harden(makeHostSpawner);
