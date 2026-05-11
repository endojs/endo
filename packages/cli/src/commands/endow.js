/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

/**
 * Parse --bind arguments into a bindings record.
 * Each binding is "codeName:petName" e.g. "counter:my-counter"
 *
 * @param {string[]} bindArgs
 * @returns {Record<string, string>}
 */
const parseBindings = bindArgs => {
  /** @type {Record<string, string>} */
  const bindings = Object.create(null);
  for (const arg of bindArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid binding format ${JSON.stringify(arg)}, expected "codeName:petName"`,
      );
    }
    const codeName = arg.slice(0, colonIndex);
    const petName = arg.slice(colonIndex + 1);
    bindings[codeName] = petName;
  }
  return bindings;
};

export const endowCommand = async ({
  messageNumberText,
  bindArgs,
  workerName,
  resultName,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const bindings = parseBindings(bindArgs);
    await E(agent).endow(
      parseBigint(messageNumberText),
      bindings,
      workerName,
      resultName,
    );
  });
