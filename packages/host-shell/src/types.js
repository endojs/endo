// @ts-check

// Typedef host for `@endo/host-shell`.  Following the repo convention
// (see `@endo/exo-git`'s `src/types.js`), the package's shared types live
// in a real `.js` module so a sibling `@import { ... } from './types.js'`
// resolves under TypeDoc / `tsc` without a separate declaration file.

/** @import { PassableBytesReader, PassableBytesWriter } from '@endo/exo-stream' */

/**
 * The terminal status of a finished process.  Exactly one of `code` /
 * `signal` is non-null: `code` for a normal exit, `signal` for a process
 * killed by a signal.
 *
 * @typedef {object} ExitStatus
 * @property {number | null} code
 * @property {NodeJS.Signals | null} signal
 */

/**
 * A running host process.  stdio is bridged over CapTP as
 * `@endo/exo-stream` byte streams; the terminal status is an awaitable
 * promise.
 *
 * @typedef {object} ShellProcess
 * @property {() => PassableBytesWriter} stdin The child's standard input
 *   as an exo-stream byte writer.
 * @property {() => PassableBytesReader} stdout The child's standard output
 *   as an exo-stream byte reader.
 * @property {() => PassableBytesReader} stderr The child's standard error
 *   as an exo-stream byte reader.
 * @property {() => Promise<ExitStatus>} exit Resolves once the process has
 *   terminated, independent of whether its stdio has been drained.
 * @property {(signal?: string | number) => boolean} kill Deliver a POSIX
 *   signal (default SIGTERM); returns whether it was delivered.
 * @property {() => number | undefined} pid The OS process id, or undefined
 *   if the process failed to spawn.
 * @property {() => string} help
 */

/**
 * @typedef {object} MakeShellProcessOptions
 * @property {string} command The executable to run (spawned directly
 *   unless `shell` is set).
 * @property {string[]} [args] A structured argument vector passed verbatim
 *   to the executable.
 * @property {string} [cwd] The child's working directory.
 * @property {Record<string, string>} [env] The child's complete
 *   environment.  When omitted the child inherits the parent's; pass an
 *   explicit object (e.g. from `buildChildEnv`) to withhold ambient
 *   variables.
 * @property {boolean | string} [shell] `false` (default) spawns a
 *   structured argv with no shell.  `true` runs through the default shell;
 *   a string names a shell executable.  Enabling a shell re-introduces the
 *   injection surface.
 * @property {'pipe' | 'ignore'} [stdin] `'pipe'` (default) bridges the
 *   child's stdin; `'ignore'` gives the child an immediate EOF and makes
 *   `stdin()` throw.
 * @property {'pipe' | 'ignore'} [stdout] `'pipe'` (default) captures the
 *   child's stdout; `'ignore'` discards it to the null device (no host
 *   buffering) and makes `stdout()` throw.
 * @property {'pipe' | 'ignore'} [stderr] `'pipe'` (default) captures the
 *   child's stderr; `'ignore'` discards it to the null device (no host
 *   buffering) and makes `stderr()` throw.
 * @property {number} [timeoutMs] Terminate the child (SIGTERM, then
 *   SIGKILL after `killGraceMs`) if it has not exited within this many
 *   milliseconds.
 * @property {number} [maxOutputBytes] Terminate the child once its
 *   combined stdout + stderr exceeds this many bytes.
 * @property {number} [killGraceMs] Milliseconds to wait after a SIGTERM
 *   before escalating to SIGKILL (default 5000).
 * @property {unknown} [context] Formula context whose cancellation tears
 *   the child down.
 */

export {};
