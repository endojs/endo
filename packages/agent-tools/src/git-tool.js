// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/far' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { GitToolCapability, ToolRecord } from './types.js' */

/** @typedef {Record<keyof GitToolCapability, (...args: unknown[]) => Promise<unknown>>} GitToolDispatch */

import { E } from '@endo/far';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { GitInterface } from '@endo/exo-git';

import { makeTool } from './tool.js';

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

// `RefArgShape = M.or(M.string(), M.recordOf(M.string(), M.any()))`.
const REF_PROP = harden({
  anyOf: [{ type: 'string' }, { type: 'object' }],
  description:
    'A git ref: either a ref string (branch/tag/commit/"HEAD") or a ' +
    'structured ref record.',
});

/**
 * This package intentionally exposes only a curated JSON-safe `EndoGit` slice
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
      properties: { arg0: OPTIONS_PROP },
      required: [],
      additionalProperties: false,
    },
  },
  diff: {
    description: 'Show changes between commits, the index, and the worktree.',
    parameters: {
      type: 'object',
      properties: { arg0: OPTIONS_PROP },
      required: [],
      additionalProperties: false,
    },
  },
  show: {
    description: 'Show the contents of a git object (commit, tag, blob).',
    parameters: {
      type: 'object',
      properties: { arg0: REF_PROP },
      required: ['arg0'],
      additionalProperties: false,
    },
  },
  commit: {
    description: 'Record the staged changes as a new commit.',
    parameters: {
      type: 'object',
      properties: {
        arg0: { type: 'string', description: 'The commit message.' },
      },
      required: ['arg0'],
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
        arg0: { type: 'string', description: 'The new branch name.' },
        arg1: OPTIONS_PROP,
      },
      required: ['arg0'],
      additionalProperties: false,
    },
  },
  switchBranch: {
    description: 'Switch the working tree to an existing branch.',
    parameters: {
      type: 'object',
      properties: {
        arg0: { type: 'string', description: 'The branch to switch to.' },
      },
      required: ['arg0'],
      additionalProperties: false,
    },
  },
  currentBranch: {
    description:
      'Report the currently checked-out branch (or nothing when detached).',
    parameters: NO_ARGS,
  },
});

/**
 * @type {(keyof GitToolCapability)[]}
 */
const gitToolMethods = harden(
  /** @type {(keyof GitToolCapability)[]} */ (Object.keys(gitToolSchemas)),
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

/**
 * Build agent-tool records for a live `Git` capability.
 *
 * @param {ERef<GitToolCapability>} gitCap
 *   A live `Git` capability. The exo `Git` cap is reached by dynamic method
 *   name through `E`, so this records only the invocation shape this maker
 *   needs.
 * @returns {ToolRecord[]}
 */
export const makeGitTool = gitCap => {
  const records = gitToolMethods.map(method => {
    const schema = gitToolSchemas[method];
    const argGuards = positionalArgGuards(method);
    return makeTool({
      name: method,
      description: schema.description,
      parameters: schema.parameters,
      argGuards,
      execute: async argsRecord => {
        // Marshal named args back to positional order.
        const positional = [];
        for (let i = 0; i < argGuards.length; i += 1) {
          positional.push(argsRecord[`arg${i}`]);
        }
        while (
          positional.length > 0 &&
          positional[positional.length - 1] === undefined
        ) {
          positional.pop();
        }
        const gitMethod = /** @type {keyof GitToolCapability} */ (method);
        const git = /** @type {GitToolDispatch} */ (E(gitCap));
        return git[gitMethod](...positional);
      },
    });
  });
  return harden(records);
};
harden(makeGitTool);
