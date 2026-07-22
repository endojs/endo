// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { GitRemoteToolCapability, ToolRecord } from '../types.js' */

/** @typedef {Record<keyof GitRemoteToolCapability, (...args: unknown[]) => Promise<unknown>>} GitRemoteToolDispatch */

import { E } from '@endo/eventual-send';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { GitRemoteInterface } from '@endo/exo-git';

import { makeTool } from '../tool.js';

/**
 * The push tier (daemon-agent-tools § Phase 3). `makeGitRemoteTool` closes over
 * a single granted `GitRemote` capability and emits the `fetch` / `pull` /
 * `push` tools — plus a credential-free `inspect` — as canonical `ToolRecord`s.
 *
 * This is the network + credential layer's tool seam. Every bound the model can
 * reach — the endpoint URL, the allowed directions, the fetch/push refspecs,
 * the force/tags/delete flags — is fixed on the `GitRemote` the host granted;
 * the policy-bearing `GitRemoteController` stays host-side and is never an
 * agent-facing tool. So this maker states no policy of its own: it neither
 * re-validates refspecs nor re-checks directions (the exo already does, failing
 * closed at the capability), and it forwards each verb's options record
 * untouched. A read-only `Git` cannot construct a `GitRemote` at all, so the
 * read tier structurally excludes push; there is nothing to filter here.
 *
 * Unlike `makeGitMountTools`, these methods are JSON-transparent: every option
 * in and every result out (structured `updatedRefs` / `integration` / `head`
 * records) is plain data, carrying no live capability across the wire, so the
 * tools' option records map onto their `GitRemoteInterface` guards on the
 * presence and shape axis, which the divergence gate pins. The hand-authored
 * schema is intentionally stricter than the open guard on option value types
 * (it documents types the exo does not re-check); the gate pins that asymmetry
 * too (`test/git-remote-tool.test.js`).
 */

const NO_ARGS = harden({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
});

/**
 * Build the `options` parameter schema for a remote verb. The runtime guard is
 * `M.recordOf(M.string(), M.any())` — an open record — so the schema documents
 * the honored keys for the model without closing the object (no
 * `additionalProperties: false` on `options`), exactly as `makeShellTool`'s
 * open `options` matches its `M.splitRecord` guard. The top level stays closed
 * so a stray sibling key is rejected in lockstep by schema and guard alike.
 *
 * @param {Record<string, object>} optionProps Documented option properties.
 * @returns {object}
 */
const optionsParameters = optionProps =>
  harden({
    type: 'object',
    properties: {
      options: {
        type: 'object',
        properties: optionProps,
        description: 'Optional per-call options; forwarded to the GitRemote.',
      },
    },
    required: [],
    additionalProperties: false,
  });

/**
 * Hand-authored JSON Schemas for the `GitRemote` methods exposed as agent
 * tools, pinned against `GitRemoteInterface` by the divergence gate. The bounds
 * these verbs honor are the granted capability's, not restated here.
 *
 * @type {Record<keyof GitRemoteToolCapability, { description: string, parameters: object }>}
 */
const gitRemoteToolSchemas = harden({
  inspect: {
    description:
      'Report this remote’s policy bounds: the endpoint URL, the allowed ' +
      'directions (fetch/push), the fetch and push refspecs, and the ' +
      'force/tags/delete flags. Reveals no credential material.',
    parameters: NO_ARGS,
  },
  fetch: {
    description:
      'Fetch from the bounded remote into the remote-tracking refs the policy ' +
      'permits, without touching the working tree. Returns the structured ' +
      'update record ({ updatedRefs }).',
    parameters: optionsParameters({
      prune: {
        type: 'boolean',
        description:
          'Delete remote-tracking refs the remote no longer advertises ' +
          '(requires the remote’s allowDelete policy).',
      },
      tags: {
        type: 'boolean',
        description:
          'Also fetch tags (requires the remote’s allowTags policy).',
      },
    }),
  },
  pull: {
    description:
      'Fetch and then integrate a fetched branch into the current branch. ' +
      'Returns { fetch, integration, head }; integration is one of ' +
      'up-to-date, fast-forward, merge, or rebase.',
    parameters: optionsParameters({
      branch: {
        type: 'string',
        description:
          'The ref to integrate; must be within the remote’s fetch ' +
          'policy. Defaults to the sole concrete fetch refspec’s ' +
          'destination when omitted.',
      },
      strategy: {
        type: 'string',
        enum: ['merge', 'rebase', 'ff-only'],
        description: 'Integration strategy; defaults to ff-only.',
      },
      prune: {
        type: 'boolean',
        description:
          'Prune during the fetch step (requires the allowDelete policy).',
      },
      tags: {
        type: 'boolean',
        description:
          'Fetch tags during the fetch step (requires the allowTags policy).',
      },
    }),
  },
  push: {
    description:
      'Push a local branch to the bounded remote within the policy’s push ' +
      'refspecs. Returns the structured update record ({ updatedRefs }).',
    parameters: optionsParameters({
      source: {
        type: 'string',
        description:
          'Local source ref to push (e.g. a branch name or refs/heads/…). ' +
          'Omit to push the policy’s configured push refspecs.',
      },
      destination: {
        type: 'string',
        description: 'Remote destination ref; defaults to the source ref.',
      },
      force: {
        type: 'boolean',
        description:
          'Force-update the destination (requires the allowForcePush policy).',
      },
      forceWithLease: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{40}$',
        description:
          'Force-update only when the destination still names this expected ' +
          '40-character commit ID (requires the allowForcePush policy).',
      },
      setUpstream: {
        type: 'boolean',
        description:
          'Record the pushed branch’s upstream tracking; requires an ' +
          'explicit source and destination.',
      },
    }),
  },
});

/** @type {(keyof GitRemoteToolCapability)[]} */
const gitRemoteToolMethods = harden(
  /** @type {(keyof GitRemoteToolCapability)[]} */ (
    Object.keys(gitRemoteToolSchemas)
  ),
);

/**
 * Positional arg guards for a method, required first and then optional.
 * `getMethodGuardPayload` unwraps the argument guards from `GitRemoteInterface`
 * so the tool enforces the exact same argument contract the exo does.
 *
 * @param {string} method
 * @returns {Pattern[]}
 */
const positionalArgGuards = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (GitRemoteInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  return harden([...argGuards, ...(optionalArgGuards || [])]);
};

/**
 * Build the push-tier agent-tool records for a live `GitRemote` capability.
 * The returned tools grant no authority the `GitRemote` does not already carry:
 * the endpoint, directions, refspecs, and credential are all fixed on the
 * capability the host granted, and the credential is never extractable through
 * this surface.
 *
 * @param {ERef<GitRemoteToolCapability>} remoteCap A live `GitRemote`
 *   capability, pre-scoped by the host. Its bounds are the tool's bounds.
 * @returns {ToolRecord[]}
 */
export const makeGitRemoteTool = remoteCap => {
  const records = gitRemoteToolMethods.map(method => {
    const schema = gitRemoteToolSchemas[method];
    const argGuards = positionalArgGuards(method);
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
        // Marshal named args back to positional order by declared name and drop
        // a trailing absent optional so the exo sees the same arity a direct
        // caller would.
        const positional = paramNames.map(paramName => argsRecord[paramName]);
        while (
          positional.length > 0 &&
          positional[positional.length - 1] === undefined
        ) {
          positional.pop();
        }
        const remoteMethod = /** @type {keyof GitRemoteToolDispatch} */ (
          method
        );
        const remote = /** @type {GitRemoteToolDispatch} */ (E(remoteCap));
        return remote[remoteMethod](...positional);
      },
    });
  });
  return harden(records);
};
harden(makeGitRemoteTool);
