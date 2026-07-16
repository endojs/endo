// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { Evaluate, EvaluateInput } from './evaluate-tool.js' */

import { E } from '@endo/eventual-send';

/**
 * Build a daemon-hosted evaluate function.
 * The host is supplied as a live powers reference and is expected to expose
 * the daemon's existing `evaluate(workerName, source, codeNames, petNames,
 * resultName)` method.
 *
 * @param {ERef<{ evaluate: (workerName: undefined, source: string, codeNames: string[], petNames: (string | string[])[], resultName?: string | string[]) => Promise<unknown> }>} powers
 * @returns {Evaluate}
 */
export const makeDaemonEvaluate = powers => {
  /** @param {EvaluateInput} input */
  const evaluate = async ({ source, resultName, globals }) => {
    const codeNames = harden(globals.map(({ name }) => name));
    const petNames = harden(
      globals.map(global => global.petName ?? global.name),
    );
    return E(powers).evaluate(
      undefined,
      source,
      codeNames,
      petNames,
      resultName,
    );
  };
  Object.defineProperty(evaluate, 'hasStoreValue', { value: true });
  return harden(evaluate);
};
harden(makeDaemonEvaluate);
