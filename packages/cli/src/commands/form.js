/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

/**
 * Parse --field arguments into a fields array.
 * Each field is "fieldName:label" e.g. "name:Your name"
 *
 * @param {string[]} fieldArgs
 * @returns {Array<{ name: string, label: string }>}
 */
const parseFields = fieldArgs => {
  /** @type {Array<{ name: string, label: string }>} */
  const fields = [];
  for (const arg of fieldArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid field format ${JSON.stringify(arg)}, expected "fieldName:label"`,
      );
    }
    const fieldName = arg.slice(0, colonIndex);
    const label = arg.slice(colonIndex + 1);
    fields.push({ name: fieldName, label });
  }
  return harden(fields);
};

export const formCommand = async ({
  toName,
  description,
  fieldArgs,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const fields = parseFields(fieldArgs);
    await E(agent).form(toName, description, fields);
  });
