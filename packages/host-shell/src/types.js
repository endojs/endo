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
 * @property {() => Promise<ExitStatus>} exit Resolves once the process and
 *   its stdio have closed.
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
 * @property {Record<string, string>} [env] The child's environment;
 *   inherits the parent's when omitted.
 * @property {boolean | string} [shell] `false` (default) spawns a
 *   structured argv with no shell.  `true` runs through the default shell;
 *   a string names a shell executable.  Enabling a shell re-introduces the
 *   injection surface.
 * @property {unknown} [context] Formula context whose cancellation tears
 *   the child down.
 */

export {};
