// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { CodeModeExecuteInput } from './evaluate-tool.js' */

import { E } from '@endo/eventual-send';

/**
 * Build a daemon-hosted execute function.
 * The host is supplied as a live powers reference and is expected to expose
 * the daemon's existing `evaluate(workerName, source, codeNames, petNames,
 * resultName)` method.
 *
 * @param {ERef<{ evaluate: (workerName: undefined, source: string, codeNames: string[], petNames: (string | string[])[], resultName?: string | string[]) => Promise<unknown> }>} powers
 * @returns {(input: CodeModeExecuteInput) => Promise<unknown>}
 */
export const makeDaemonExecute =
  powers =>
  async ({ source, resultName, globals }) => {
    const codeNames = harden(globals.map(({ name }) => name));
    const petNames = harden(globals.map(({ petName = name }) => petName));
    return E(powers).evaluate(
      undefined,
      source,
      codeNames,
      petNames,
      resultName,
    );
  };
harden(makeDaemonExecute);
