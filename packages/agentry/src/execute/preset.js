// @ts-check
/// <reference types="ses"/>

/** @import { Model } from '@earendil-works/pi-ai' */
/** @import { Agent, AgentMessage, StreamFn } from '@earendil-works/pi-agent-core' */
/** @import { Credentials, GetApiKey } from '../harness/credentials.js' */
/** @import { ThinkingLevel } from '../harness/model.js' */
/** @import { CodeModeExecute, CodeModeGlobal, CodeModePower, PowerHandle, LookupPowers } from './tool.js' */

import { E } from '@endo/far';
import { isGitReadOnly } from '@endo/exo-git';

import { defineAgent } from '../define-agent.js';
import { getAmbientEnv, makeEnvCredentials } from '../harness/credentials.js';
import { makeCompartmentExecute } from './compartment.js';
import { makeExecuteTool, toSmallcapsPiAgentTool } from './tool.js';
import { makeCodeModeSystemPrompt, normalizeGlobals } from './globals.js';
import { makeGitGlobal } from './git.js';
import { makeWorkspaceGlobal } from './fs.js';

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
 * @property {'readOnly' | 'readWrite'} [gitMode]
 * @property {CodeModeGlobal[]} [namedPowers]
 *
 * @typedef {object} MakeCodeModeAgentOptions
 * @property {Model<string>} model
 * @property {CodeModePowers} [powers]
 * @property {LookupPowers} [lookupPowers] A live powers handle with
 *   `lookup(petName)` for resolving capabilities not passed inline.
 * @property {Credentials} [credentials]
 * @property {Record<string, unknown>} [endowments]
 * @property {CodeModeExecute} [execute]
 * @property {(value: unknown, resultName: string | string[]) => Promise<void> | void} [storeResult]
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
 * read-only vs read-write split is a prompt-surface policy: `gitMode:
 * 'readOnly'` selects the `gitReadOnly` declaration (inspection verbs only),
 * while the runtime read-only enforcement stays the exo guard. `namedPowers`
 * stay name-only unless the caller attached its own `declaration`.
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
 * Construct a live code-mode agent: an agent whose sole tool is `execute`,
 * which evaluates JavaScript in a Compartment endowed with the configured
 * lexical powers. This is the code-mode preset of {@link defineAgent}; there is
 * no separate `define*` wrapper. The powerless definition is `defineAgent`'s
 * closure; supplying powers here is the powered stage.
 *
 * @param {MakeCodeModeAgentOptions} options
 * @returns {{ agent: Agent, globals: CodeModeGlobal[], execute: CodeModeExecute, systemPrompt: string, model: Model<string> }}
 */
export const makeCodeModeAgent = options => {
  const {
    model,
    powers = {},
    lookupPowers,
    credentials = makeEnvCredentials(getAmbientEnv()),
    endowments: baseEndowments = {},
    storeResult,
    messages,
    streamFn,
    getApiKey,
    thinkingLevel,
    preamble,
  } = options;

  const globals = options.globals
    ? normalizeGlobals(options.globals)
    : makeCodeModeGlobals(powers);
  const systemPrompt =
    options.systemPrompt || makeCodeModeSystemPrompt(globals, { preamble });

  const resolvedPowers = resolveConfiguredPowers(powers, lookupPowers);
  const execute =
    options.execute ||
    makeCompartmentExecute({
      endowments: makeCodeModeEndowments(
        powers,
        resolvedPowers,
        baseEndowments,
        lookupPowers,
      ),
      storeResult,
    });
  const tool = makeExecuteTool(execute, globals);

  const maker = defineAgent({
    model,
    instructions: systemPrompt,
    tools: [toSmallcapsPiAgentTool(tool)],
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
  return { agent, globals, execute, systemPrompt, model };
};
harden(makeCodeModeAgent);

/**
 * @typedef {object} GitLoopOptions
 * @property {Model<string>} model
 * @property {CodeModePower} workspace
 * @property {CodeModePower} git
 * @property {CodeModeExecute} [execute]
 * @property {Record<string, unknown>} [endowments]
 * @property {CodeModeGlobal[]} [globals]
 * @property {string} [systemPrompt]
 * @property {AgentMessage[]} [messages]
 * @property {StreamFn} [streamFn]
 * @property {GetApiKey} [getApiKey]
 * @property {ThinkingLevel} [thinkingLevel]
 * @property {boolean} [readOnlyGit]
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
      'You are an Endo-hosted Pi coding agent. Use the execute tool to inspect and edit the repository through the workspace Filesystem and Git capabilities.',
    execute: options.execute,
    messages: options.messages,
    streamFn: options.streamFn,
    getApiKey: options.getApiKey,
    thinkingLevel: options.thinkingLevel,
  });
  return agent;
};
harden(makeCodeModeGitLoopAgent);
