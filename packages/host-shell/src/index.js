// @ts-check
/// <reference types="ses"/>

import { makeError, q, X } from '@endo/errors';

import {
  makeShellProcess,
  parseArgs,
  parseProcessEnv,
  parseShell,
} from './shell-process.js';

export {
  makeShellProcess,
  parseArgs,
  parseShell,
  parseProcessEnv,
} from './shell-process.js';
export { ShellProcessInterface } from './interfaces.js';

/** @import { ShellProcess } from '../types.js' */

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
 * - `env.cwd` (optional): the child's working directory.
 * - `env.processEnv` (optional): a JSON object of additional environment
 *   variables, merged onto the worker's own environment.  When omitted,
 *   the child inherits the worker's environment unchanged.
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
  const { command, args, shell, cwd, processEnv } = env;
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
    env: parseProcessEnv(processEnv),
    context,
  });
};
harden(make);
