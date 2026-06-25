// @ts-check
/// <reference types="ses"/>

import { makeError, q, X } from '@endo/errors';

import {
  buildChildEnv,
  makeShellProcess,
  parseArgs,
  parseEnvKeys,
  parsePositiveInteger,
  parseShell,
  parseStdio,
} from './shell-process.js';

export {
  buildChildEnv,
  makeShellProcess,
  parseArgs,
  parseEnvKeys,
  parsePositiveInteger,
  parseProcessEnv,
  parseShell,
  parseStdio,
} from './shell-process.js';
export { ShellProcessInterface } from './interfaces.js';

/** @import { ShellProcess } from './types.js' */

/**
 * Unconfined Endo formula entry point.  The daemon's `make-unconfined`
 * formula loads this module by file URL in a Node worker and calls
 * `make(powers, context, { env })`.  Each formula instance is bound to
 * one specific command, captured in its `env`, and re-runs that command
 * whenever the formula is (re)incarnated.
 *
 * The command is read from the formula `env`:
 *
 * - `env.command` (required): the executable to run.  With no `env.shell`
 *   this is spawned directly with a structured argv (no shell, so
 *   argument values cannot inject extra commands).
 * - `env.args` (optional): a JSON array of string arguments.
 * - `env.shell` (optional): `'true'` to run `command` through the default
 *   shell (enabling pipelines / redirection / `&&` chaining), or a path
 *   to name a specific shell.  Omitted or `'false'` keeps the safe,
 *   shell-free structured argv.
 * - `env.stdin` / `env.stdout` / `env.stderr` (optional): `'pipe'`
 *   (default) bridges the stream over CapTP; `'ignore'` wires the fd to
 *   the null device, so the host does not buffer a stream the caller does
 *   not want (and `'ignore'`d stdin gives the child an immediate EOF).
 * - `env.cwd` (optional): the child's working directory.
 * - `env.processEnv` (optional): a JSON object of additional environment
 *   variables, layered on top of the child's base environment.
 * - `env.extraEnvKeys` (optional): a JSON array of additional worker env
 *   variable names to pass through to the child (e.g. `SSH_AUTH_SOCK`),
 *   without inheriting the whole environment.
 * - `env.inheritEnv` (optional): `'true'` to give the child the worker's
 *   full environment.  By default the child inherits only a small safe
 *   allowlist (PATH, HOME, locale, scratch dirs) plus `extraEnvKeys`, so
 *   daemon secrets are not exposed to an arbitrary command.
 * - `env.timeoutMs` (optional): a positive integer; the child is sent
 *   SIGTERM (then SIGKILL after a grace period) if it has not exited
 *   within this many milliseconds.
 * - `env.maxOutputBytes` (optional): a positive integer; the child is
 *   sent SIGTERM once its combined stdout + stderr exceeds this many
 *   bytes.
 * - `env.killGraceMs` (optional): a positive integer; how long to wait
 *   after a SIGTERM before escalating to SIGKILL (default 5000).
 *
 * The returned {@link ShellProcess} exo exposes the child's stdio as
 * exo-stream byte streams (`stdin` / `stdout` / `stderr`, each buffered
 * 64) and an `exit` promise carrying the terminal `{ code, signal }`.
 *
 * @param {unknown} powers - Daemon-supplied powers (unused; the child
 *   process is the authority this formula wields).
 * @param {unknown} context - Formula context; its cancellation tears
 *   down the child process.
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {ShellProcess}
 */
export const make = (powers, context, { env = {} } = {}) => {
  const {
    command,
    args,
    shell,
    cwd,
    processEnv,
    extraEnvKeys,
    inheritEnv,
    timeoutMs,
    maxOutputBytes,
    killGraceMs,
    stdin,
    stdout,
    stderr,
  } = env;
  if (typeof command !== 'string' || command.length === 0) {
    throw makeError(
      X`@endo/host-shell requires a non-empty "command" in the formula env, got ${q(
        command,
      )}`,
    );
  }
  return makeShellProcess({
    command,
    args: parseArgs(args),
    shell: parseShell(shell),
    cwd,
    env: buildChildEnv({
      processEnv,
      inheritEnv,
      extraEnvKeys: parseEnvKeys(extraEnvKeys),
    }),
    timeoutMs: parsePositiveInteger(timeoutMs, 'timeoutMs'),
    maxOutputBytes: parsePositiveInteger(maxOutputBytes, 'maxOutputBytes'),
    killGraceMs: parsePositiveInteger(killGraceMs, 'killGraceMs'),
    stdin: parseStdio(stdin, 'stdin'),
    stdout: parseStdio(stdout, 'stdout'),
    stderr: parseStdio(stderr, 'stderr'),
    context,
  });
};
harden(make);
