// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from './tool.js' */

const IDENTIFIER_RE = /^[A-Za-z_$][0-9A-Za-z_$]*$/;

/**
 * @param {unknown} value
 * @returns {value is string | string[]}
 */
const isResultName = value =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.every(part => typeof part === 'string'));

/**
 * Normalize a list of code-mode globals: each global must have a JS-identifier
 * `name`; `petName` defaults to `name`; `description` is carried as-is. Type
 * declarations are intentionally not part of the prompt surface — the model
 * introspects a live capability via `E(cap).__getMethodNames__()` rather than
 * reading a hand-maintained type blob.
 *
 * @param {CodeModeGlobal[]} globals
 * @returns {CodeModeGlobal[]}
 */
export const normalizeGlobals = globals =>
  harden(
    globals.map(global => {
      const { name, petName = name, description } = global;
      if (!IDENTIFIER_RE.test(name)) {
        throw new Error(
          `code-mode global name must be a JS identifier: ${name}`,
        );
      }
      if (!isResultName(petName)) {
        throw new Error(`code-mode global "${name}" has invalid petName`);
      }
      return harden({ name, petName, description });
    }),
  );
harden(normalizeGlobals);

/**
 * Format the lexical globals as a prompt fragment: one `declare const <name>;`
 * per global, annotated with its one-line description. No type declaration is
 * emitted — the model discovers a capability's method surface at runtime via
 * CapTP introspection (`E(name).__getMethodNames__()`).
 *
 * @param {CodeModeGlobal[]} globals
 * @returns {string}
 */
export const formatGlobalDeclarations = globals =>
  globals
    .map(global => {
      const description = global.description
        ? ` // ${global.description.replaceAll('\n', ' ')}`
        : '';
      return `declare const ${global.name};${description}`;
    })
    .join('\n');

/**
 * Build the system prompt for the narrow code-mode agent.
 *
 * @param {CodeModeGlobal[]} globals
 * @param {{ preamble?: string }} [options]
 * @returns {string}
 */
export const makeCodeModeSystemPrompt = (globals, options = {}) => {
  const normalized = normalizeGlobals(globals);
  const preamble =
    options.preamble ||
    'You are codeMode, an Endo code-mode agent. You solve tasks by writing JavaScript and calling the execute tool.';
  return `${preamble}

You have exactly one tool: execute. Do not call any other tool and do not answer in prose when a tool call can do the work.

The execute tool evaluates JavaScript source in an Endo Compartment. The compartment includes hardened SES globals plus the powers listed below. These powers are already in lexical scope; do not look them up by pet name. Discover a capability's methods at runtime with E(capability).__getMethodNames__().

Use E(capability).method(...) for remotable capabilities. Top-level await is not available, so use an async IIFE when you need multiple awaits or a final awaited result:

\`\`\`js
(async () => {
  const value = await E(example).method();
  return value;
})()
\`\`\`

Return the desired value as the source completion value. Use resultName only when the user asks you to store the result for later.

Available powers:

\`\`\`ts
declare const E;
${formatGlobalDeclarations(normalized)}
\`\`\`
`;
};
harden(makeCodeModeSystemPrompt);
