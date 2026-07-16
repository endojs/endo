// @ts-check
/// <reference types="ses"/>

/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { Agent, AgentMessage, StreamFn } from '@earendil-works/pi-agent-core' */
/** @import { Credentials, GetApiKey } from './harness/credentials.js' */
/** @import { ThinkingLevel } from './harness/model.js' */
/** @import { Evaluate, StoreValue, CodeModeGlobal, CodeModePower, PowerHandle, LookupPowers } from '@endo/agent-tools/code-mode/evaluate-tool.js' */

import { E } from '@endo/eventual-send';
import { isGitHistoryRewrite, isGitReadOnly } from '@endo/exo-git';
import { makeCompartmentEvaluate } from '@endo/agent-tools/code-mode/compartment.js';
import { makeEvaluateTool } from '@endo/agent-tools/code-mode/evaluate-tool.js';
import {
  formatGlobalDeclarations,
  normalizeGlobals,
} from '@endo/agent-tools/code-mode/declarations.js';
import { makeWorkspaceGlobal } from '@endo/agent-tools/code-mode-globals/fs.js';
import { makeGitGlobal } from '@endo/agent-tools/code-mode-globals/git.js';
import { toPiAgentTool } from '@endo/agent-tools/adapters/pi.js';
import { toolResultToSmallcaps } from '@endo/agent-tools/adapters/smallcaps.js';

import { defineAgent } from './define-agent.js';
import { getAmbientEnv, makeEnvCredentials } from './harness/credentials.js';

/**
 * Build the system prompt for the narrow code-mode agent.
 *
 * @param {CodeModeGlobal[]} globals
 * @param {{ preamble?: string, storeValue?: boolean }} [options]
 * @returns {string}
 */
export const makeCodeModeSystemPrompt = (globals, options = {}) => {
  const normalized = normalizeGlobals(globals);
  const resultNameGuidance = options.storeValue
    ? ' Use resultName only when the user asks you to store the result for later.'
    : '';
  const preamble =
    options.preamble ||
    'You are codeMode, an Endo code-mode agent. You solve tasks by writing JavaScript and calling the evaluate tool.';
  return `${preamble}

You have exactly one tool: evaluate. Do not call any other tool and do not answer in prose when a tool call can do the work.

The evaluate tool evaluates JavaScript source in an Endo Compartment. The compartment includes hardened SES globals plus the powers listed below. These powers are already in lexical scope; do not look them up by pet name. The TypeScript declarations below are your primary reference: use them to pick a method and its arguments before your first call rather than probing at runtime. They may be a subset of a capability's live surface, so if you need a method that is not declared, discover it with E(capability).__getMethodNames__().

Use E(capability).method(...) for remotable capabilities. Top-level await is not available, so use an async IIFE when you need multiple awaits or a final awaited result:

\`\`\`js
(async () => {
  const value = await E(example).method();
  return value;
})()
\`\`\`

Return the desired value as the source completion value.${resultNameGuidance}

Available powers:

\`\`\`ts
declare const E;
${formatGlobalDeclarations(normalized)}
\`\`\`
`;
};
harden(makeCodeModeSystemPrompt);

const IDENTIFIER_RE = /^[A-Za-z_$][0-9A-Za-z_$]*$/;

/**
 * @param {string} petName
 * @param {string} label
 * @returns {string}
 */
const petNameToBindingName = (petName, label) => {
  if (IDENTIFIER_RE.test(petName)) {
    return petName;
  }
  throw new Error(
    `code-mode ${label} petName must be a single JS identifier to use as a lexical binding`,
  );
};

/**
 * @param {LookupPowers | undefined} powers
 * @param {string | string[]} petName
 * @param {string} label
 * @returns {Promise<PowerHandle>}
 */
const lookupRequiredPower = (powers, petName, label) => {
  if (powers === undefined || powers === null) {
    throw new Error(`code-mode ${label} capability requires powers`);
  }
  return E(powers).lookup(petName);
};

/**
 * @typedef {object} CodeModePowers
 * @property {CodeModePower} [workspace]
 * @property {string} [workspacePetName]
 * @property {CodeModePower} [git]
 * @property {string} [gitPetName]
 * @property {'readOnly' | 'readWrite' | 'historyRewrite'} [gitMode]
 * @property {CodeModeGlobal[]} [namedPowers]
 *
 * @typedef {object} MakeCodeModeAgentOptions
 * @property {Model<string>} model
 * @property {CodeModePowers} [powers]
 * @property {LookupPowers} [lookupPowers] A live powers handle with
 *   `lookup(petName)` for resolving capabilities not passed inline.
 * @property {Credentials} [credentials]
 * @property {Record<string, unknown>} [endowments]
 * @property {Evaluate} [evaluate]
 * @property {StoreValue} [storeValue]
 * @property {() => Promise<void> | void} [onContainedEventualSendRejection]
 * @property {CodeModeGlobal[]} [globals]
 * @property {string} [systemPrompt]
 * @property {string} [preamble]
 * @property {AgentMessage[]} [messages]
 * @property {StreamFn} [streamFn]
 * @property {GetApiKey} [getApiKey]
 * @property {ThinkingLevel} [thinkingLevel]
 */

/**
 * Build the lexical globals for a code-mode agent from its configured powers.
 * This builder only chooses WHICH globals to inject from the configured powers;
 * the per-exo specifics (descriptions, generated declarations, the read-only
 * member policy) live in `git.js` and `fs.js`, which this delegates to. The
 * `gitMode` selects the one configured Git capability's prompt surface.
 * Runtime authority remains with that capability; `namedPowers` stay name-only
 * unless the caller attached its own `declaration`.
 *
 * @param {CodeModePowers} powers
 * @returns {CodeModeGlobal[]}
 */
const makeCodeModeGlobals = (powers = {}) => {
  /** @type {CodeModeGlobal[]} */
  const globals = [];
  if (powers.workspace !== undefined || powers.workspacePetName !== undefined) {
    const workspacePetName = powers.workspacePetName ?? 'workspace';
    globals.push(
      makeWorkspaceGlobal({
        name: petNameToBindingName(workspacePetName, 'workspace'),
        petName: workspacePetName,
      }),
    );
  }
  if (powers.git !== undefined || powers.gitPetName !== undefined) {
    const gitPetName = powers.gitPetName ?? 'git';
    globals.push(
      makeGitGlobal({
        name: petNameToBindingName(gitPetName, 'git'),
        petName: gitPetName,
        readOnly: powers.gitMode === 'readOnly',
        historyRewrite: powers.gitMode === 'historyRewrite',
      }),
    );
  }
  globals.push(...(powers.namedPowers || []));
  return normalizeGlobals(globals);
};
harden(makeCodeModeGlobals);

/**
 * @param {CodeModePowers} powers
 * @param {LookupPowers | undefined} lookupPowers
 * @returns {Record<string, CodeModePower>}
 */
const resolveConfiguredPowers = (powers, lookupPowers) => {
  /** @type {Record<string, CodeModePower>} */
  const resolved = {};
  if (powers.workspace !== undefined || powers.workspacePetName !== undefined) {
    const workspacePetName = powers.workspacePetName ?? 'workspace';
    const workspaceName = petNameToBindingName(workspacePetName, 'workspace');
    resolved[workspaceName] =
      powers.workspace ??
      lookupRequiredPower(lookupPowers, workspacePetName, 'workspace');
  }
  if (powers.git !== undefined || powers.gitPetName !== undefined) {
    const gitPetName = powers.gitPetName ?? 'git';
    const gitName = petNameToBindingName(gitPetName, 'git');
    resolved[gitName] =
      powers.git ?? lookupRequiredPower(lookupPowers, gitPetName, 'git');
    if (powers.gitMode === 'readOnly') {
      const gitReadOnly = isGitReadOnly(resolved[gitName]);
      if (gitReadOnly === false) {
        throw new Error(
          'code-mode gitMode readOnly requires an already read-only Git capability',
        );
      }
    }
    if (powers.gitMode === 'historyRewrite') {
      const gitHistoryRewrite = isGitHistoryRewrite(resolved[gitName]);
      if (gitHistoryRewrite === false) {
        throw new Error(
          'code-mode gitMode historyRewrite requires a Git capability with history-rewrite authority',
        );
      }
    }
  }
  return harden(resolved);
};

/**
 * @param {CodeModePowers} powers
 * @param {Record<string, CodeModePower>} resolvedPowers
 * @param {Record<string, unknown>} baseEndowments
 * @param {LookupPowers | undefined} lookupPowers
 * @returns {Record<string, unknown>}
 */
const makeCodeModeEndowments = (
  powers,
  resolvedPowers,
  baseEndowments,
  lookupPowers,
) => {
  /** @type {Record<string, unknown>} */
  const endowments = {
    E,
    ...baseEndowments,
    ...resolvedPowers,
  };
  for (const namedPower of powers.namedPowers || []) {
    if (!Object.prototype.hasOwnProperty.call(endowments, namedPower.name)) {
      endowments[namedPower.name] = lookupRequiredPower(
        lookupPowers,
        namedPower.petName || namedPower.name,
        namedPower.name,
      );
    }
  }
  return harden(endowments);
};

/**
 * Construct a live code-mode agent: an agent whose sole tool is `evaluate`,
 * which evaluates JavaScript in a Compartment endowed with the configured
 * lexical powers. This is the code-mode preset of {@link defineAgent}; there is
 * no separate `define*` wrapper. The powerless definition is `defineAgent`'s
 * closure; supplying powers here is the powered stage.
 *
 * @param {MakeCodeModeAgentOptions} options
 * @returns {{ agent: Agent, globals: CodeModeGlobal[], evaluate: Evaluate, systemPrompt: string, model: Model<string> }}
 */
export const makeCodeModeAgent = options => {
  const {
    model,
    powers = {},
    lookupPowers,
    credentials = makeEnvCredentials(getAmbientEnv()),
    endowments: baseEndowments = {},
    storeValue,
    onContainedEventualSendRejection,
    messages,
    streamFn,
    getApiKey,
    thinkingLevel,
    preamble,
  } = options;

  const globals = options.globals
    ? normalizeGlobals(options.globals)
    : makeCodeModeGlobals(powers);

  if (
    options.evaluate !== undefined &&
    onContainedEventualSendRejection !== undefined
  ) {
    throw new Error(
      'code-mode onContainedEventualSendRejection has no effect with a custom evaluate; the containment wrapper lives in makeCompartmentEvaluate, which a custom evaluate bypasses',
    );
  }

  const resolvedPowers = resolveConfiguredPowers(powers, lookupPowers);
  const evaluate =
    options.evaluate ||
    makeCompartmentEvaluate({
      endowments: makeCodeModeEndowments(
        powers,
        resolvedPowers,
        baseEndowments,
        lookupPowers,
      ),
      storeValue,
      onContainedEventualSendRejection,
    });
  const evaluateWithStore =
    /** @type {Evaluate & { hasStoreValue?: boolean }} */ (evaluate);
  const hasStoreValue =
    storeValue !== undefined || evaluateWithStore.hasStoreValue === true;
  const systemPrompt =
    options.systemPrompt ||
    makeCodeModeSystemPrompt(globals, { preamble, storeValue: hasStoreValue });
  const tool = makeEvaluateTool(
    evaluate,
    globals,
    hasStoreValue ? storeValue || true : undefined,
  );

  const maker = defineAgent({
    model,
    instructions: systemPrompt,
    tools: [toPiAgentTool(tool, { renderToolResult: toolResultToSmallcaps })],
  });
  const agent = maker({
    credentials,
    messages,
    streamFn,
    getApiKey,
    thinkingLevel,
  });
  // The returned record is intentionally NOT hardened: `agent` is a live
  // pi-agent-core instance that mutates its own run state (e.g. `activeRun`)
  // while driving a conversation, so deep-freezing it would break the loop.
  return { agent, globals, evaluate, systemPrompt, model };
};
harden(makeCodeModeAgent);

/**
 * @typedef {object} GitLoopOptions
 * @property {Model<string>} model
 * @property {CodeModePower} workspace
 * @property {CodeModePower} git
 * @property {Evaluate} [evaluate]
 * @property {Record<string, unknown>} [endowments]
 * @property {() => Promise<void> | void} [onContainedEventualSendRejection]
 * @property {CodeModeGlobal[]} [globals]
 * @property {string} [systemPrompt]
 * @property {AgentMessage[]} [messages]
 * @property {StreamFn} [streamFn]
 * @property {GetApiKey} [getApiKey]
 * @property {ThinkingLevel} [thinkingLevel]
 * @property {boolean} [readOnlyGit]
 * @property {StoreValue} [storeValue]
 */

/**
 * The git-loop preset: a thin alias over {@link makeCodeModeAgent} that wires a
 * repository `workspace` Filesystem and a `git` capability as the lexical
 * powers and supplies the repository-oriented preamble. Returns the live
 * `Agent`.
 *
 * @param {GitLoopOptions} options
 * @returns {Agent}
 */
export const makeCodeModeGitLoopAgent = options => {
  const { workspace, git, readOnlyGit = false } = options;
  const { agent } = makeCodeModeAgent({
    model: options.model,
    powers: {
      workspace,
      git,
      gitMode: readOnlyGit ? 'readOnly' : 'readWrite',
    },
    endowments: options.endowments,
    globals: options.globals,
    systemPrompt: options.systemPrompt,
    preamble:
      'You are an Endo-hosted Pi coding agent. Use the evaluate tool to inspect and edit the repository through the workspace Filesystem and Git capabilities.',
    evaluate: options.evaluate,
    storeValue: options.storeValue,
    onContainedEventualSendRejection: options.onContainedEventualSendRejection,
    messages: options.messages,
    streamFn: options.streamFn,
    getApiKey: options.getApiKey,
    thinkingLevel: options.thinkingLevel,
  });
  return agent;
};
harden(makeCodeModeGitLoopAgent);
