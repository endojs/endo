// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/far' */
/** @import { Tool } from '@earendil-works/pi-ai' */
/** @import { AgentTool } from '@earendil-works/pi-agent-core' */
/** @import { ToolRecord } from '@endo/agent-tools' */

import { makeTool } from '@endo/agent-tools/tool.js';
import { toPiAgentTool } from '@endo/agent-tools/pi';

import { toolResultToSmallcaps } from '../harness/marshal.js';
import { normalizeGlobals } from './globals.js';

const EXECUTE_PARAMETERS = harden({
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description:
        'JavaScript source to evaluate in the code-mode compartment.',
    },
    resultName: {
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      description:
        'Optional pet name or pet-name path where the completion value is stored.',
    },
  },
  required: ['source'],
  additionalProperties: false,
});

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
 * @typedef {object} CodeModeExecuteInput
 * @property {string} source
 * @property {string | string[]} [resultName]
 * @property {CodeModeGlobal[]} globals
 *
 * @typedef {(input: CodeModeExecuteInput) => Promise<unknown>} CodeModeExecute
 */

/**
 * @param {unknown} value
 * @returns {value is string | string[]}
 */
const isResultName = value =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.every(part => typeof part === 'string'));

/**
 * Build the model-facing `execute` tool: a single JSON-schema'd tool whose
 * invocation forwards validated `{ source, resultName }` to the supplied
 * `execute` function alongside the normalized lexical globals.
 *
 * @param {CodeModeExecute} execute
 * @param {CodeModeGlobal[]} globals
 * @returns {ToolRecord}
 */
export const makeExecuteTool = (execute, globals) => {
  const normalized = normalizeGlobals(globals);
  return makeTool({
    name: 'execute',
    description:
      'Evaluate JavaScript source with the code-mode powers in lexical scope.',
    parameters: EXECUTE_PARAMETERS,
    execute: async args => {
      const { source, resultName } = args;
      if (typeof source !== 'string') {
        throw new Error('execute.source must be a string');
      }
      if (resultName !== undefined && !isResultName(resultName)) {
        throw new Error('execute.resultName must be a string or string[]');
      }
      return execute({
        source,
        resultName,
        globals: normalized,
      });
    },
  });
};
harden(makeExecuteTool);

/**
 * Bridge the execute `ToolRecord` into a pi-agent-core `AgentTool`, injecting
 * the harness SmallCaps renderer so completion values round-trip BigInts and
 * sigil-prefixed strings to the model.
 *
 * @param {ToolRecord} tool
 * @returns {AgentTool<Tool['parameters']>}
 */
export const toSmallcapsPiAgentTool = tool =>
  // Pre-bind the harness's SmallCaps renderer onto the upstream
  // `@endo/agent-tools/pi` `toPiAgentTool`: `renderToolResult` is that bridge's
  // option key, and `toolResultToSmallcaps` is the encoder supplied as its
  // value. The wrapper's sole job is this pre-binding, hence the codec-forward
  // name paralleling `toolResultToSmallcaps`.
  toPiAgentTool(tool, { renderToolResult: toolResultToSmallcaps });
harden(toSmallcapsPiAgentTool);
