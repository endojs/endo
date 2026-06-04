// @ts-check
/// <reference types="ses"/>

/** @import { ToolSpec, ToolRecord } from './types.js' */

import { mustMatch } from '@endo/patterns';

/**
 * Marshal a named-args record `{arg0, arg1, …}` into a positional array in
 * ordinal order. Optional trailing `undefined` values are dropped; required
 * positions are retained for guard validation.
 *
 * @param {Record<string, unknown>} argsRecord
 * @param {number} arity Number of positional slots (`argGuards.length`).
 * @param {number} requiredCount Number of required positional slots.
 * @returns {unknown[]}
 */
const namedToPositional = (argsRecord, arity, requiredCount) => {
  const positional = [];
  for (let i = 0; i < arity; i += 1) {
    positional.push(argsRecord[`arg${i}`]);
  }
  // Drop trailing `undefined` (optional/absent args).
  while (
    positional.length > requiredCount &&
    positional[positional.length - 1] === undefined
  ) {
    positional.pop();
  }
  return positional;
};

const ARG_KEY_PATTERN = /^arg(?:0|[1-9]\d*)$/;

/**
 * @param {object} parameters
 * @returns {string[]}
 */
const getRequiredArgKeys = parameters => {
  const { required } = /** @type {{ required?: unknown }} */ (parameters);
  if (!Array.isArray(required)) {
    return harden([]);
  }
  return harden(
    required.filter(
      key => typeof key === 'string' && ARG_KEY_PATTERN.test(key),
    ),
  );
};

/**
 * @param {string[]} requiredArgKeys
 * @returns {number}
 */
const getRequiredArgCount = requiredArgKeys => {
  let requiredCount = 0;
  for (const key of requiredArgKeys) {
    requiredCount = Math.max(requiredCount, Number(key.slice(3)) + 1);
  }
  return requiredCount;
};

/**
 * @param {Record<string, unknown>} argsRecord
 * @returns {Record<string, unknown>}
 */
const copyHardenArgsRecord = argsRecord => {
  if (
    argsRecord === null ||
    typeof argsRecord !== 'object' ||
    Array.isArray(argsRecord)
  ) {
    throw new Error('tool arguments must be a record');
  }
  return harden({ ...argsRecord });
};

/**
 * Build a tool record from its JSON Schema, optional positional guards, and
 * dispatch function. The schema is advertised to callers; the guards enforce
 * the same positional argument contract at runtime.
 *
 * @param {ToolSpec} spec
 * @returns {ToolRecord}
 */
export const makeTool = spec => {
  const { name, description, parameters, argGuards, execute } = spec;
  // Avoid retaining a mutable caller-owned schema object.
  const hardenedParameters = harden(parameters);
  const requiredArgKeys = getRequiredArgKeys(hardenedParameters);
  const requiredArgCount = getRequiredArgCount(requiredArgKeys);
  return harden({
    name,
    description,
    parameters: hardenedParameters,
    inputSchema: hardenedParameters,
    /**
     * @param {Record<string, unknown>} argsRecord
     */
    invoke: async argsRecord => {
      const hardenedArgsRecord = copyHardenArgsRecord(argsRecord);
      if (argGuards !== undefined) {
        // Reject keys outside the positional guard list.
        const allowed = new Set(argGuards.map((_g, i) => `arg${i}`));
        for (const key of Object.keys(hardenedArgsRecord)) {
          if (!allowed.has(key)) {
            throw new Error(`unexpected tool argument key "${key}"`);
          }
        }
        for (const key of requiredArgKeys) {
          if (
            !Object.prototype.hasOwnProperty.call(hardenedArgsRecord, key) ||
            hardenedArgsRecord[key] === undefined
          ) {
            throw new Error(`missing required tool argument "${key}"`);
          }
        }
        const positional = namedToPositional(
          hardenedArgsRecord,
          argGuards.length,
          requiredArgCount,
        );
        // `namedToPositional` drops omitted optional tail args.
        for (let i = 0; i < positional.length; i += 1) {
          mustMatch(positional[i], argGuards[i], `${name} arg${i}`);
        }
      }
      return execute(hardenedArgsRecord);
    },
  });
};
harden(makeTool);
