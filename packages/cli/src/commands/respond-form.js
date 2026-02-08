/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

/**
 * Parse --value arguments into a values record.
 * Each value is "fieldName:value" e.g. "name:Alice"
 *
 * @param {string[]} valueArgs
 * @returns {Record<string, string>}
 */
const parseValues = valueArgs => {
  /** @type {Record<string, string>} */
  const values = Object.create(null);
  for (const arg of valueArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid value format ${JSON.stringify(arg)}, expected "fieldName:value"`,
      );
    }
    const fieldName = arg.slice(0, colonIndex);
    const value = arg.slice(colonIndex + 1);
    values[fieldName] = value;
  }
  return values;
};

export const respondFormCommand = async ({
  messageNumberText,
  valueArgs,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const values = parseValues(valueArgs);
    await E(agent).respondForm(parseBigint(messageNumberText), values);
  });
