// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { ShellToolCapability, ToolRecord, RejectPatternEntry, RejectFlagEntry, ShellToolOptions } from './types.js' */

/** @typedef {Record<keyof ShellToolCapability, (...args: unknown[]) => Promise<unknown>>} ShellToolDispatch */

import { E } from '@endo/eventual-send';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { ShellInterface } from '@endo/exo-shell';

import { makeTool } from './tool.js';

/**
 * Build an advisory command-string veto from `@endo/exo-shell`-style reject
 * entries.  Ported from genie's `rejectPatterns` / `rejectFlags`
 * (`packages/genie/src/tools/command.js`).  These run in the tool layer,
 * *before* the call reaches `Shell.exec`, and are hardening advice — not the
 * boundary.  The boundary is the formula-owned allowlist enforced inside the
 * `Shell` exo (design § Shell capability); an allowlisted child is still an
 * ordinary host process, so the veto is defense-in-depth, not confinement.
 *
 * @param {RejectPatternEntry[]} rejectPatterns
 * @param {RejectFlagEntry[]} rejectFlags
 * @returns {(command: string, args: string[]) => void}
 */
const makeAdvisoryVeto = (rejectPatterns, rejectFlags) => {
  /** @type {Map<string, string | undefined>} */
  const forbiddenFlags = new Map();
  for (const entry of rejectFlags) {
    if (typeof entry === 'string') {
      forbiddenFlags.set(entry, undefined);
    } else {
      forbiddenFlags.set(entry.flag, entry.reason);
    }
  }
  return harden((command, args) => {
    const tokens = harden([command, ...args]);
    for (const entry of rejectPatterns) {
      const pattern = entry instanceof RegExp ? entry : entry.pattern;
      const reason = entry instanceof RegExp ? undefined : entry.reason;
      if (tokens.some(token => pattern.test(token))) {
        throw new Error(
          reason
            ? `Command contains a forbidden pattern: ${reason}`
            : 'Command contains a forbidden pattern',
        );
      }
    }
    for (const token of tokens) {
      if (forbiddenFlags.has(token)) {
        const reason = forbiddenFlags.get(token);
        throw new Error(
          reason
            ? `Forbidden flag: ${token} — ${reason}`
            : `Forbidden flag: ${token}`,
        );
      }
    }
  });
};

/**
 * JSON Schemas for the Shell methods exposed as agent tools. Hand-authored and
 * pinned against `ShellInterface` by the divergence gate
 * (`test/shell-tool.test.js`).
 *
 * @type {Record<keyof ShellToolCapability, { description: string, parameters: object }>}
 */
const shellToolSchemas = harden({
  exec: {
    description:
      'Run an allowlisted command with a structured argv (no shell string, ' +
      'no interpolation). Returns { stdout, stderr, exitCode, signal, ' +
      'truncated }; a non-zero exitCode is data, not an error.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The program to run (argv[0]); must be in the shell allowlist.',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Arguments passed to the program, one array element each.',
        },
        options: {
          // Open object (no `additionalProperties: false`) to match the
          // runtime guard `ExecOptionsShape` — an `M.splitRecord` whose
          // optional part admits unlisted keys.  The divergence gate pins the
          // two together.
          type: 'object',
          properties: {
            timeoutMs: {
              type: 'number',
              description:
                'Per-call timeout in ms; may only narrow the policy timeout.',
            },
          },
          description: 'Optional per-call execution options.',
        },
      },
      required: ['command', 'args'],
      additionalProperties: false,
    },
  },
  inspect: {
    description:
      'Report the shell policy bounds: the command allowlist, timeout, and ' +
      'output cap. Reveals no host path.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
});

/** @type {(keyof ShellToolCapability)[]} */
const shellToolMethods = harden(
  /** @type {(keyof ShellToolCapability)[]} */ (Object.keys(shellToolSchemas)),
);

/**
 * Positional arg guards for a method, required first and then optional.
 *
 * @param {string} method
 * @returns {Pattern[]}
 */
const positionalArgGuards = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (ShellInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  return harden([...argGuards, ...(optionalArgGuards || [])]);
};

/**
 * Build agent-tool records for a live `Shell` capability.
 *
 * @param {ERef<ShellToolCapability>} shellCap
 * @param {ShellToolOptions} [options]
 *   Advisory reject entries ported from genie's command-tool policy closures.
 *   They veto a command string *before* it reaches `Shell.exec`; they are not
 *   the boundary (the formula-owned allowlist is). `rejectPatterns` /
 *   `rejectFlags` default to empty (unlike genie's command tool, which ships a
 *   curated `DANGEROUS_PATTERNS` set); a caller wanting advisory vetoes must
 *   pass them.
 * @returns {ToolRecord[]}
 */
export const makeShellTool = (shellCap, options = {}) => {
  const { rejectPatterns = [], rejectFlags = [] } = options;
  const veto = makeAdvisoryVeto(
    harden([...rejectPatterns]),
    harden([...rejectFlags]),
  );

  const records = shellToolMethods.map(method => {
    const schema = shellToolSchemas[method];
    const argGuards = positionalArgGuards(method);
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
        if (method === 'exec') {
          const command = /** @type {string} */ (argsRecord.command);
          const args = /** @type {string[]} */ (argsRecord.args);
          // Advisory veto before the call reaches the exo.
          veto(command, args);
        }
        const positional = paramNames.map(paramName => argsRecord[paramName]);
        while (
          positional.length > 0 &&
          positional[positional.length - 1] === undefined
        ) {
          positional.pop();
        }
        const shellMethod = /** @type {keyof ShellToolCapability} */ (method);
        const shell = /** @type {ShellToolDispatch} */ (E(shellCap));
        return shell[shellMethod](...positional);
      },
    });
  });
  return harden(records);
};
harden(makeShellTool);
