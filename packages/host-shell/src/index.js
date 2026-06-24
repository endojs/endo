// @ts-check
/// <reference types="ses"/>

import { makeError, q, X } from '@endo/errors';

import { makeBashProcess, parseProcessEnv } from './bash-process.js';

export { makeBashProcess, parseProcessEnv } from './bash-process.js';
export { BashProcessInterface } from './interfaces.js';

/** @import { BashProcess } from '../types.js' */

/**
 * Unconfined Endo formula entry point.  The daemon's `make-unconfined`
 * formula loads this module by file URL in a Node worker and calls
 * `make(powers, context, { env })`.
 *
 * The shell command is read from the formula `env`:
 *
 * - `env.command` (required): the script run as `bash -c <command>`.
 * - `env.cwd` (optional): the child's working directory.
 * - `env.shell` (optional): the shell executable, default `bash`.
 * - `env.processEnv` (optional): a JSON object of additional environment
 *   variables, merged onto the worker's own environment.  When omitted,
 *   the child inherits the worker's environment unchanged.
 *
 * The returned {@link BashProcess} exo exposes the child's stdio as
 * exo-stream byte streams (`stdin` / `stdout` / `stderr`, each buffered
 * 64) and an `exit` promise carrying the terminal `{ code, signal }`.
 *
 * @param {unknown} powers - Daemon-supplied powers (unused; the child
 *   process is the authority this formula wields).
 * @param {unknown} context - Formula context; its cancellation tears
 *   down the child process.
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {BashProcess}
 */
export const make = (powers, context, { env = {} } = {}) => {
  const { command, cwd, shell, processEnv } = env;
  if (typeof command !== 'string' || command.length === 0) {
    throw makeError(
      X`@endo/bash requires a non-empty "command" in the formula env, got ${q(
        command,
      )}`,
    );
  }
  return makeBashProcess({
    command,
    cwd,
    shell,
    env: parseProcessEnv(processEnv),
    context,
  });
};
harden(make);
