// @ts-check
/* global harden */
/* eslint-disable no-await-in-loop */

import { E } from '@endo/eventual-send';

/**
 * @typedef {import('./tool-makers.js').ToolSchema} ToolSchema
 * @typedef {import('./tool-makers.js').FaeTool} FaeTool
 */

/**
 * @typedef {object} DiscoveredTools
 * @property {ToolSchema[]} schemas - OpenAI function-calling schemas for the LLM
 * @property {Map<string, FaeTool | object>} toolMap - name → tool object
 */

/**
 * Discover all available tools by merging local built-in tools with any
 * daemon-side tools stored in the `tools/` petname directory.
 *
 * Called at the start of each agent turn so that tools adopted between
 * turns (e.g., received via mail) are immediately available.
 *
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @param {Map<string, FaeTool>} localTools
 * @returns {Promise<DiscoveredTools>}
 */
export const discoverTools = async (host, localTools) => {
  /** @type {Map<string, FaeTool | object>} */
  const toolMap = new Map(localTools);
  /** @type {ToolSchema[]} */
  const schemas = [];

  for (const [, tool] of localTools) {
    schemas.push(tool.schema());
  }

  try {
    const names = /** @type {string[]} */ (await E(host).list('tools'));
    for (const name of names) {
      try {
        const tool = await E(host).lookup(['tools', name]);
        const toolSchema = /** @type {ToolSchema} */ (await E(tool).schema());
        if (!toolMap.has(name)) {
          toolMap.set(name, /** @type {object} */ (tool));
          schemas.push(toolSchema);
        }
      } catch (/** @type {any} */ err) {
        console.warn(
          `[fae] tools/${name}: not a valid FaeTool: ${err.message || err}`,
        );
      }
    }
  } catch (/** @type {any} */ err) {
    console.warn(
      `[fae] Could not list tools/ directory: ${err.message || err}`,
    );
  }

  return harden({ schemas, toolMap });
};
harden(discoverTools);

/**
 * Execute a tool by name using the discovered tool map.
 *
 * Uses E() so that both local tools and daemon far-reference tools
 * are called uniformly via eventual send.
 *
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {Map<string, FaeTool | object>} toolMap
 * @returns {Promise<string>}
 */
export const executeTool = async (name, args, toolMap) => {
  const tool = toolMap.get(name);
  if (!tool) {
    const available = [...toolMap.keys()].join(', ');
    throw new Error(`Unknown tool: "${name}". Available tools: ${available}`);
  }
  const result = await E(tool).execute(args);
  return /** @type {string} */ (result);
};
harden(executeTool);
