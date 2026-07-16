// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { ToolRecord } from '@endo/agent-tools' */

import { makeTool } from '../tool.js';

import { normalizeGlobals } from './declarations.js';

const RESULT_NAME_SCHEMA = harden({
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  description:
    'Optional pet name or pet-name path where the completion value is stored.',
});

/**
 * @param {boolean} hasStoreValue
 * @returns {object}
 */
const makeEvaluateParameters = hasStoreValue =>
  harden({
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description:
          'JavaScript source to evaluate in the code-mode compartment.',
      },
      ...(hasStoreValue && { resultName: RESULT_NAME_SCHEMA }),
    },
    required: ['source'],
    additionalProperties: false,
  });

const EVALUATE_PARAMETERS_WITHOUT_STORE = makeEvaluateParameters(false);

/** The JSON Schema for an `evaluate` tool with storage authority. */
export const EVALUATE_PARAMETERS = makeEvaluateParameters(true);
harden(EVALUATE_PARAMETERS);

/**
 * The settled shape of a code-mode power: an opaque object capability
 * (typically an Endo remotable / exo). The model never sees a checked-in type
 * for a power and discovers its method surface at runtime via
 * `E(power).__getMethodNames__()`, so the static type is deliberately just
 * `object` — narrow enough to exclude primitives, wide enough to accept any
 * remotable regardless of which model provider drives the agent. Named
 * separately from {@link CodeModePower} so a `lookup` result
 * (a `Promise<PowerHandle>`) and an inline-passed power (an `ERef<PowerHandle>`)
 * stay distinct without nesting promises.
 *
 * @typedef {object} PowerHandle
 *
 * An opaque, eventual-send capability handle endowed into the code-mode
 * compartment under a lexical name. Provider-agnostic; a far reference to a
 * {@link PowerHandle}.
 *
 * @typedef {ERef<PowerHandle>} CodeModePower
 *
 * The minimum required powers handle: an object exposing `lookup(petName)` for
 * resolving capabilities that were not passed inline. This is the smallest
 * surface the presets depend on, named so the `unknown` placeholder can be
 * dropped at the call sites that resolve deferred powers.
 *
 * @typedef {{ lookup: (petName: string | string[]) => Promise<PowerHandle> }} LookupPowers
 *
 * @typedef {(valueOrPromise: unknown, nameOrPath: string | string[]) => Promise<void> | void} StoreValue
 *
 * @typedef {object} GlobalDeclaration A generated TypeScript declaration for a
 *   code-mode global. `body` is the root type name spliced after
 *   `declare const <name>:`; `aux` is the supporting `type` aliases emitted
 *   above it (omitted when the body needs no supporting aliases).
 * @property {string} body
 * @property {string} [aux]
 *
 * @typedef {object} CodeModeGlobal
 * @property {string} name
 * @property {string | string[]} [petName]
 * @property {string} [description]
 * @property {GlobalDeclaration} [declaration] Generated TypeScript declaration
 *   for this global. When set, `formatGlobalDeclarations` emits a typed
 *   `declare const` for this global instead of a name-only one. The per-exo
 *   files (`git.js`, `fs.js`) supply these; unset for `namedPowers`, which stay
 *   name-only. A consumer can attach its own.
 *
 * @typedef {object} EvaluateInput
 * @property {string} source
 * @property {string | string[]} [resultName]
 * @property {CodeModeGlobal[]} globals
 *
 * @typedef {(input: EvaluateInput) => Promise<unknown>} Evaluate
 *
 * @typedef {Evaluate & { hasStoreValue?: boolean }} EvaluateWithStoreValue
 */

/**
 * @param {unknown} value
 * @returns {value is string | string[]}
 */
const isResultName = value =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.every(part => typeof part === 'string'));

/**
 * Build the model-facing `evaluate` tool.
 * The result-name parameter is advertised only when storage authority is
 * supplied by the caller or by the host evaluate function.
 *
 * @param {Evaluate} evaluate
 * @param {CodeModeGlobal[]} globals
 * @param {StoreValue | boolean} [storeValue] Storage authority, or `true` for
 *   a host that stores through another mechanism.
 * @returns {ToolRecord}
 */
export const makeEvaluateTool = (evaluate, globals, storeValue) => {
  const normalized = normalizeGlobals(globals);
  const evaluateWithStore = /** @type {EvaluateWithStoreValue} */ (evaluate);
  const hasStoreValue =
    storeValue !== undefined || evaluateWithStore.hasStoreValue === true;
  const parameters = hasStoreValue
    ? EVALUATE_PARAMETERS
    : EVALUATE_PARAMETERS_WITHOUT_STORE;
  return makeTool({
    name: 'evaluate',
    description:
      'Evaluate JavaScript source with the code-mode powers in lexical scope.',
    parameters,
    execute: async args => {
      const { source, resultName } = args;
      if (typeof source !== 'string') {
        throw new Error('evaluate.source must be a string');
      }
      if (!hasStoreValue && Object.hasOwn(args, 'resultName')) {
        throw new Error(
          'unexpected evaluate argument "resultName" without storeValue',
        );
      }
      if (resultName !== undefined && !isResultName(resultName)) {
        throw new Error('evaluate.resultName must be a string or string[]');
      }
      return evaluate({
        source,
        resultName,
        globals: normalized,
      });
    },
  });
};
harden(makeEvaluateTool);
