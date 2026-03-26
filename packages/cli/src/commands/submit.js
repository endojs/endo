/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

/**
 * Parse --field arguments into a values record.
 * Each value is "fieldName:value" e.g. "name:Alice"
 *
 * @param {string[]} fieldArgs
 * @returns {Record<string, string>}
 */
const parseValues = fieldArgs => {
  /** @type {Record<string, string>} */
  const values = {};
  for (const arg of fieldArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid field format ${JSON.stringify(arg)}, expected "fieldName:value"`,
      );
    }
    const fieldName = arg.slice(0, colonIndex);
    const value = arg.slice(colonIndex + 1);
    values[fieldName] = value;
  }
  return values;
};

export const submitCommand = async ({
  messageNumberText,
  fieldArgs,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const values = parseValues(fieldArgs);
    await E(agent).submit(parseBigint(messageNumberText), values);
  });
