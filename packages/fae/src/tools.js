// @ts-check
/* global harden */
/* eslint-disable no-await-in-loop */

import { E } from '@endo/eventual-send';

import {
  makeEvaluateTool,
  makeReadFileTool,
  makeWriteFileTool,
  makeEditFileTool,
  makeListDirTool,
  makeRunCommandTool,
  makeListPetnamesTool,
  makeLookupTool,
  makeStoreTool,
  makeRemoveTool,
  makeAdoptToolTool,
} from './tool-makers.js';

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
 * Create all built-in local tools. Local tools run in the fae process and
 * have access to the filesystem and host far reference.
 *
 * @param {import('@endo/eventual-send').ERef<object>} host
 * @param {string} cwd
 * @returns {Map<string, FaeTool>}
 */
export const installBuiltinTools = (host, cwd) => {
  /** @type {Map<string, FaeTool>} */
  const tools = new Map();

  tools.set('evaluate', makeEvaluateTool(host));
  tools.set('readFile', makeReadFileTool(cwd));
  tools.set('writeFile', makeWriteFileTool(cwd));
  tools.set('editFile', makeEditFileTool(cwd));
  tools.set('listDir', makeListDirTool(cwd));
  tools.set('runCommand', makeRunCommandTool(cwd));
  tools.set('list', makeListPetnamesTool(host));
  tools.set('lookup', makeLookupTool(host));
  tools.set('store', makeStoreTool(host));
  tools.set('remove', makeRemoveTool(host));
  tools.set('adoptTool', makeAdoptToolTool(host));

  return tools;
};
harden(installBuiltinTools);

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
      if (!toolMap.has(name)) {
        try {
          const tool = await E(host).lookup(['tools', name]);
          const toolSchema = /** @type {ToolSchema} */ (
            await E(tool).schema()
          );
          toolMap.set(name, /** @type {object} */ (tool));
          schemas.push(toolSchema);
        } catch {
          // Entry does not conform to FaeTool interface; skip.
        }
      }
    }
  } catch {
    // tools/ directory does not exist yet; no daemon tools to discover.
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
    throw new Error(`Unknown tool: ${name}`);
  }
  const result = await E(tool).execute(args);
  return /** @type {string} */ (result);
};
harden(executeTool);
