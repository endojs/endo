// @ts-check
/// <reference types="ses"/>

/** @import { ToolInvocationContext, ToolSpec, ToolRecord } from './types.js' */

import { mustMatch } from '@endo/patterns';

/**
 * Read the ordered list of declared parameter property names from a JSON Schema
 * `parameters` object. The property insertion order is the positional argument
 * order: the first declared property maps to the first positional slot, and so
 * on. A schema with no `properties` (or a non-object one) has no named slots.
 *
 * @param {object} parameters
 * @returns {string[]}
 */
const getParamNames = parameters => {
  const { properties } = /** @type {{ properties?: unknown }} */ (parameters);
  if (
    properties === null ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return harden([]);
  }
  return harden(Object.keys(properties));
};

/**
 * Read the set of required parameter property names from a JSON Schema
 * `parameters` object, restricted to names that are actually declared as
 * positional slots (so a stray `required` entry cannot enlarge arity).
 *
 * @param {object} parameters
 * @param {string[]} paramNames Ordered declared property names.
 * @returns {Set<string>}
 */
const getRequiredParamNames = (parameters, paramNames) => {
  const { required } = /** @type {{ required?: unknown }} */ (parameters);
  const declared = new Set(paramNames);
  if (!Array.isArray(required)) {
    return new Set();
  }
  return new Set(
    required.filter(key => typeof key === 'string' && declared.has(key)),
  );
};

/**
 * Marshal a named-args record into a positional array, ordering the values by
 * the schema's declared property-name order. Trailing optional `undefined`
 * values are dropped; the leading `requiredCount` positions are always
 * retained for guard validation.
 *
 * @param {Record<string, unknown>} argsRecord
 * @param {string[]} paramNames Ordered declared property names.
 * @param {number} requiredCount Number of leading positional slots to retain.
 * @returns {unknown[]}
 */
const namedToPositional = (argsRecord, paramNames, requiredCount) => {
  const positional = paramNames.map(name => argsRecord[name]);
  // Drop trailing `undefined` (optional/absent args).
  while (
    positional.length > requiredCount &&
    positional[positional.length - 1] === undefined
  ) {
    positional.pop();
  }
  return positional;
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
 * The schema's `parameters.properties` insertion order is the positional
 * argument order, and `parameters.required` names the leading required slots.
 * The named-args record a caller supplies is marshalled into positionals by
 * that declared order before the guards validate it.
 *
 * @param {ToolSpec} spec
 * @returns {ToolRecord}
 */
export const makeTool = spec => {
  const { name, description, parameters, argGuards, execute } = spec;
  // Avoid retaining a mutable caller-owned schema object.
  const hardenedParameters = harden(parameters);
  const paramNames = getParamNames(hardenedParameters);
  const requiredParamNames = getRequiredParamNames(
    hardenedParameters,
    paramNames,
  );
  // Required slots must be the leading positional arguments, so arity counts up
  // to the last required declared property.
  let requiredCount = 0;
  paramNames.forEach((paramName, index) => {
    if (requiredParamNames.has(paramName)) {
      requiredCount = Math.max(requiredCount, index + 1);
    }
  });
  return harden({
    name,
    description,
    parameters: hardenedParameters,
    inputSchema: hardenedParameters,
    /**
     * @param {Record<string, unknown>} argsRecord
     * @param {ToolInvocationContext} [context]
     */
    invoke: async (argsRecord, context) => {
      const hardenedArgsRecord = copyHardenArgsRecord(argsRecord);
      if (argGuards !== undefined) {
        // Reject keys outside the declared property list.
        const allowed = new Set(paramNames);
        for (const key of Object.keys(hardenedArgsRecord)) {
          if (!allowed.has(key)) {
            throw new Error(`unexpected tool argument key "${key}"`);
          }
        }
        for (const key of requiredParamNames) {
          if (
            !Object.prototype.hasOwnProperty.call(hardenedArgsRecord, key) ||
            hardenedArgsRecord[key] === undefined
          ) {
            throw new Error(`missing required tool argument "${key}"`);
          }
        }
        const positional = namedToPositional(
          hardenedArgsRecord,
          paramNames,
          requiredCount,
        );
        // `namedToPositional` drops omitted optional tail args.
        for (let i = 0; i < positional.length; i += 1) {
          mustMatch(positional[i], argGuards[i], `${name} ${paramNames[i]}`);
        }
      }
      return execute(hardenedArgsRecord, context);
    },
  });
};
harden(makeTool);
