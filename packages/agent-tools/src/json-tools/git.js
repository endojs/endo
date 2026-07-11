// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { GitHistoryToolCapability, GitToolCapability, ToolRecord } from '../types.js' */

/** @typedef {Record<keyof GitToolCapability | keyof GitHistoryToolCapability, (...args: unknown[]) => Promise<unknown>>} GitToolDispatch */

import { E } from '@endo/eventual-send';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
  M,
} from '@endo/patterns';
import { GitInterface } from '@endo/exo-git';
import { GitRebaseStartInputShape } from '@endo/exo-git/src/interfaces.js';

import { makeTool } from '../tool.js';

/**
 * JSON Schemas for the Git methods exposed as agent tools. Methods that need
 * remotable arguments or return live capabilities are excluded; runtime arg
 * guards come from `GitInterface`.
 */

const NO_ARGS = harden({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
});

// `M.recordOf(M.string(), M.any())` → an open object.
const OPTIONS_PROP = harden({
  type: 'object',
  description: 'Options record passed through to the underlying git command.',
});

// `RefArgShape = M.or(M.string(), GitRefShape)`.
const REF_PROP = harden({
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kind: { enum: ['branch', 'tag', 'commit', 'detached'] },
        oid: { type: 'string' },
      },
      required: ['name', 'kind'],
      additionalProperties: false,
    },
  ],
  description:
    'A git ref: either a ref string (branch/tag/commit/"HEAD") or a ' +
    'structured ref record.',
});

const COMMIT_OPTIONS_PROP = harden({
  type: 'object',
  properties: {
    amend: {
      type: 'boolean',
      description: 'Amend HEAD instead of creating a new commit.',
    },
  },
  required: [],
  additionalProperties: false,
});

const COMMIT_PROP = harden({
  type: 'string',
  description: 'The commit message.',
});

const CHERRY_PICK_OPTIONS_PROP = harden({
  type: 'object',
  properties: {
    noCommit: {
      type: 'boolean',
      description:
        'Apply the patch to the index and worktree without committing.',
    },
  },
  required: [],
  additionalProperties: false,
});

const REBASE_START_INPUT_PROP = harden({
  type: 'object',
  properties: {
    mode: { const: 'start' },
    upstream: {
      type: 'string',
      description: 'The upstream ref to replay the current branch onto.',
    },
    autosquash: {
      type: 'boolean',
      description: 'Fold fixup!/squash! commits during the replay.',
    },
  },
  required: ['mode', 'upstream'],
  additionalProperties: false,
});

/**
 * This package intentionally exposes only a curated JSON-safe writable Git slice
 * for now. Methods that remotely accept capabilities or can return
 * capabilities, including non-empty `status()` rows, need capref/result
 * serialization and are deferred future work.
 *
 * @type {Record<keyof GitToolCapability, { description: string, parameters: object }>}
 */
const gitToolSchemas = harden({
  log: {
    description: 'List commit history, most recent first.',
    parameters: {
      type: 'object',
      properties: { options: OPTIONS_PROP },
      required: [],
      additionalProperties: false,
    },
  },
  diff: {
    description: 'Show changes between commits, the index, and the worktree.',
    parameters: {
      type: 'object',
      properties: { options: OPTIONS_PROP },
      required: [],
      additionalProperties: false,
    },
  },
  show: {
    description: 'Show the contents of a git object (commit, tag, blob).',
    parameters: {
      type: 'object',
      properties: { ref: REF_PROP },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  commit: {
    description: 'Record the staged changes as a new commit.',
    parameters: {
      type: 'object',
      properties: {
        message: COMMIT_PROP,
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  branches: {
    description: 'List the repository branches.',
    parameters: NO_ARGS,
  },
  createBranch: {
    description: 'Create a new branch.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The new branch name.' },
        options: OPTIONS_PROP,
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  switchBranch: {
    description: 'Switch the working tree to an existing branch.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'The branch to switch to.' },
      },
      required: ['branch'],
      additionalProperties: false,
    },
  },
  currentBranch: {
    description:
      'Report the currently checked-out branch (or nothing when detached).',
    parameters: NO_ARGS,
  },
});

/** @type {Record<keyof GitHistoryToolCapability, { description: string, parameters: object }>} */
const gitHistoryToolSchemas = harden({
  commit: {
    description: 'Record staged changes, or amend HEAD when requested.',
    parameters: {
      type: 'object',
      properties: {
        message: COMMIT_PROP,
        options: COMMIT_OPTIONS_PROP,
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  reword: {
    description: 'Replace a commit message while keeping its patch unchanged.',
    parameters: {
      type: 'object',
      properties: {
        ref: REF_PROP,
        message: { type: 'string', description: 'The replacement message.' },
      },
      required: ['ref', 'message'],
      additionalProperties: false,
    },
  },
  cherryPick: {
    description: 'Replay an existing commit onto the current branch.',
    parameters: {
      type: 'object',
      properties: { ref: REF_PROP, options: CHERRY_PICK_OPTIONS_PROP },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  rebase: {
    description: 'Replay the current branch onto an upstream ref.',
    parameters: {
      type: 'object',
      properties: { input: REBASE_START_INPUT_PROP },
      required: ['input'],
      additionalProperties: false,
    },
  },
});

/**
 * @type {(keyof GitToolCapability)[]}
 */
const gitToolMethods = harden(
  /** @type {(keyof GitToolCapability)[]} */ (Object.keys(gitToolSchemas)),
);

/** @type {(keyof GitHistoryToolCapability)[]} */
const gitHistoryToolMethods = harden(
  /** @type {(keyof GitHistoryToolCapability)[]} */ (
    Object.keys(gitHistoryToolSchemas)
  ),
);

/**
 * Positional arg guards for a method, required first and then optional.
 * `getMethodGuardPayload` unwraps the `M.callWhen` await-arg wrappers.
 *
 * @param {string} method
 * @returns {Pattern[]}
 */
const positionalArgGuards = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (GitInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  return harden([...argGuards, ...(optionalArgGuards || [])]);
};

/** @type {Partial<Record<keyof GitHistoryToolCapability, Pattern[]>>} */
const gitHistoryToolArgGuards = harden({
  rebase: harden([
    M.and(positionalArgGuards('rebase')[0], GitRebaseStartInputShape),
  ]),
});

/**
 * Build agent-tool records for a live `Git` capability.
 *
 * @param {ERef<GitToolCapability | GitHistoryToolCapability>} gitCap
 *   A live `Git` capability. The exo `Git` cap is reached by dynamic method
 *   name through `E`, so this records only the invocation shape this maker
 *   needs.
 * @param {(keyof GitToolDispatch)[]} methods
 * @param {Partial<Record<keyof GitToolDispatch, { description: string, parameters: object }>>} schemas
 * @param {Partial<Record<keyof GitToolDispatch, Pattern[]>>} argGuardsByMethod
 * @returns {ToolRecord[]}
 */
const makeGitTools = (gitCap, methods, schemas, argGuardsByMethod = {}) => {
  const records = methods.map(method => {
    const schema = /** @type {{ description: string, parameters: object }} */ (
      schemas[method]
    );
    const argGuards = argGuardsByMethod[method] || positionalArgGuards(method);
    // The schema's declared property order is the positional argument order,
    // matching the convention `makeTool` applies to the named-args record.
    const paramNames = Object.keys(
      /** @type {{ properties?: Record<string, unknown> }} */ (
        schema.parameters
      ).properties || {},
    );
    return makeTool({
      name: method,
      description: schema.description,
      parameters: schema.parameters,
      argGuards,
      execute: async argsRecord => {
        // Marshal named args back to positional order by declared name.
        const positional = paramNames.map(paramName => argsRecord[paramName]);
        while (
          positional.length > 0 &&
          positional[positional.length - 1] === undefined
        ) {
          positional.pop();
        }
        const gitMethod = /** @type {keyof GitToolDispatch} */ (method);
        const git = /** @type {GitToolDispatch} */ (E(gitCap));
        return git[gitMethod](...positional);
      },
    });
  });
  return harden(records);
};

/**
 * Build the default attenuated agent-tool records for a live `Git` capability.
 *
 * @param {ERef<GitToolCapability>} gitCap
 * @returns {ToolRecord[]}
 */
export const makeGitTool = gitCap =>
  makeGitTools(gitCap, gitToolMethods, gitToolSchemas);
harden(makeGitTool);

/**
 * Build explicitly elevated history-rewrite tool records for a live `Git`
 * capability.
 * Hosts must opt in to exposing these operations to a model.
 *
 * @param {ERef<GitHistoryToolCapability>} gitCap
 * @returns {ToolRecord[]}
 */
export const makeGitHistoryTool = gitCap =>
  makeGitTools(
    gitCap,
    gitHistoryToolMethods,
    gitHistoryToolSchemas,
    gitHistoryToolArgGuards,
  );
harden(makeGitHistoryTool);
