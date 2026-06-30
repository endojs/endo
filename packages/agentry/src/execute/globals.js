// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeGlobal, GlobalDeclaration } from './tool.js' */

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
 * @param {unknown} value
 * @returns {value is GlobalDeclaration}
 */
const isDeclaration = value => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = /** @type {{ body?: unknown, aux?: unknown }} */ (value);
  return (
    typeof record.body === 'string' &&
    (record.aux === undefined || typeof record.aux === 'string')
  );
};

/**
 * Normalize a list of code-mode globals: each global must have a JS-identifier
 * `name`; `petName` defaults to `name`; `description` is carried as-is. An
 * optional `declaration` (`{ aux?, body }`) is a generated TypeScript block
 * that `formatGlobalDeclarations` splices into the prompt so the model can pick
 * a method and its arguments before its first call. This module is exo-agnostic:
 * the per-exo files (`git.js`, `fs.js`) supply the `declaration`, and a consumer
 * can attach its own. Globals without a `declaration` (the common `namedPowers`
 * case) stay name-only, and `E(cap).__getMethodNames__()` remains the runtime
 * fallback for any method a declaration does not cover (a guard-derived
 * declaration can be a subset of the live surface by design).
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
      const { name, petName = name, description, declaration } = global;
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
      if (declaration !== undefined && !isDeclaration(declaration)) {
        throw new Error(
          `code-mode global "${name}" has an invalid declaration (expected { aux?: string, body: string })`,
        );
      }
      return harden({
        name,
        petName,
        description,
        ...(declaration !== undefined && { declaration }),
      });
    }),
  );
};
harden(normalizeGlobals);

/**
 * Format the lexical globals as a prompt fragment. A global carrying a
 * `declaration` is emitted as a real typed declaration: its supporting `type`
 * aliases followed by `declare const <name>: <RootType>;`. The per-exo files
 * supply those declarations (printed from the canonical TypeScript for `git`
 * and from the FS interface guards for `workspace`); this formatter is
 * exo-agnostic and prints whatever `declaration` a global carries. A global
 * without a `declaration` stays name-only (`declare const <name>;`); the model
 * discovers its method surface at runtime via CapTP introspection
 * (`E(name).__getMethodNames__()`), which is also the fallback for any method a
 * declaration omits.
 *
 * Each distinct supporting-aux block is emitted once even if two globals share
 * the same `declaration`, so the `type` aliases are not duplicated in the
 * prompt.
 *
 * @param {CodeModeGlobal[]} globals
 * @returns {string}
 */
export const formatGlobalDeclarations = globals => {
  /** @type {string[]} */
  const lines = [];
  const emittedAux = new Set();
  for (const global of globals) {
    const description = global.description
      ? ` // ${global.description.replaceAll('\n', ' ')}`
      : '';
    const { declaration } = global;
    if (declaration) {
      if (declaration.aux && !emittedAux.has(declaration.aux)) {
        emittedAux.add(declaration.aux);
        lines.push(declaration.aux);
      }
      lines.push(
        `declare const ${global.name}: ${declaration.body};${description}`,
      );
    } else {
      lines.push(`declare const ${global.name};${description}`);
    }
  }
  return lines.join('\n');
};

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

The execute tool evaluates JavaScript source in an Endo Compartment. The compartment includes hardened SES globals plus the powers listed below. These powers are already in lexical scope; do not look them up by pet name. The TypeScript declarations below are your primary reference: use them to pick a method and its arguments before your first call rather than probing at runtime. They may be a subset of a capability's live surface, so if you need a method that is not declared, discover it with E(capability).__getMethodNames__().

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
