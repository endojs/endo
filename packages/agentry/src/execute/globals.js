// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal } from './tool.js' */

const IDENTIFIER_RE = /^[A-Za-z_$][0-9A-Za-z_$]*$/;

// `E` is always injected into the code-mode compartment as the eventual-send
// operator (see `makeCodeModeEndowments` in execute/preset.js and the
// `declare const E;` line `makeCodeModeSystemPrompt` emits). A global named `E`
// would collide with it; reject it by name rather than letting the injected `E`
// silently win at endowment-merge time.
const RESERVED_GLOBAL_NAMES = harden(['E']);

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
 * Global names must be unique and must not collide with a reserved binding
 * (`E`). A duplicate or reserved name is a misconfiguration — the well-known
 * `workspace` / `git` globals are pushed before `namedPowers` in
 * `makeCodeModeGlobals`, and the injected `E` is spread first in
 * `makeCodeModeEndowments`, so a collision would otherwise let the earlier
 * binding silently win while `formatGlobalDeclarations` emitted a duplicate
 * `declare const` line into the prompt. Throw instead, so the author learns
 * their power was shadowed rather than getting a silently powerless binding.
 *
 * @param {CodeModeGlobal[]} globals
 * @returns {CodeModeGlobal[]}
 */
export const normalizeGlobals = globals => {
  const seen = new Set();
  return harden(
    globals.map(global => {
      const { name, petName = name, description } = global;
      if (!IDENTIFIER_RE.test(name)) {
        throw new Error(
          `code-mode global name must be a JS identifier: ${name}`,
        );
      }
      if (RESERVED_GLOBAL_NAMES.includes(name)) {
        throw new Error(
          `code-mode global name "${name}" is reserved and cannot be used`,
        );
      }
      if (seen.has(name)) {
        throw new Error(`code-mode global name "${name}" is declared twice`);
      }
      seen.add(name);
      if (!isResultName(petName)) {
        throw new Error(`code-mode global "${name}" has invalid petName`);
      }
      return harden({ name, petName, description });
    }),
  );
};
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
