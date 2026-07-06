// @ts-check

// Typedef host for `@endo/exo-shell`.  Mirrors the pattern of
// `@endo/exo-git/src/types.js`: the public capability-surface types live here
// so downstream consumers (the daemon, `@endo/agent-tools`) can reach them
// without importing the implementation module.

/**
 * The bounds baked into a Shell formula at `provideShell` time.  `env` and
 * `searchPath` are host-private construction inputs (the sanitized child
 * environment and the PATH used to resolve `argv[0]`); they are deliberately
 * absent from what `inspect()` reveals.
 *
 * @typedef {object} ShellPolicy
 * @property {string[]} allowedCommands  Exact command names permitted as
 *   `argv[0]`; anything else is rejected before a child is spawned.
 * @property {number} timeoutMs  Wall-clock budget per `exec`; a per-call
 *   `timeoutMs` may only narrow it.
 * @property {number} maxOutputBytes  Per-stream (stdout / stderr) byte cap;
 *   output beyond it is dropped and the result flagged `truncated`.
 * @property {Record<string, string>} [env]  Explicit environment passlist for
 *   spawned children; nothing from the host process env is inherited.
 * @property {string} [searchPath]  PATH used to resolve `argv[0]`; baked so the
 *   capability reconstitutes identically across daemon restart.
 */

/**
 * @typedef {object} ShellResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {boolean} truncated
 */

/**
 * Public `Shell` capability surface, minted by `EndoHost.provideShell` and
 * `DaemonCore.formulateShell`.  Argv-only (`exec(command, args[])`); there is
 * no shell-string mode on this surface.
 *
 * @typedef {object} EndoShell
 * @property {() => Promise<ShellPolicy>} inspect  Reveal the policy bounds
 *   (never `cwd`, `env`, or `searchPath`).
 * @property {(
 *   command: string,
 *   args: string[],
 *   options?: { timeoutMs?: number },
 * ) => Promise<ShellResult>} exec
 */

export {};
