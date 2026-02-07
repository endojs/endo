/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseOptionalPetNamePath } from '../pet-name.js';

/**
 * Parse --field arguments into a fields record.
 * Each field is "fieldName:label" e.g. "name:Your name"
 *
 * @param {string[]} fieldArgs
 * @returns {Record<string, { label: string }>}
 */
const parseFields = fieldArgs => {
  /** @type {Record<string, { label: string }>} */
  const fields = Object.create(null);
  for (const arg of fieldArgs) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(
        `Invalid field format ${JSON.stringify(arg)}, expected "fieldName:label"`,
      );
    }
    const fieldName = arg.slice(0, colonIndex);
    const label = arg.slice(colonIndex + 1);
    fields[fieldName] = { label };
  }
  return fields;
};

export const formCommand = async ({
  toName,
  description,
  fieldArgs,
  resultName,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const fields = parseFields(fieldArgs);
    const result = await E(agent).form(
      toName,
      description,
      fields,
      parseOptionalPetNamePath(resultName),
    );
    console.log(result);
  });
