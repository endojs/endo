/* global process */
import path from 'path';
import os from 'os';

import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Mount an external filesystem directory.
 *
 * @param {object} options
 * @param {string} options.sourcePath - Local directory to mount.
 * @param {string} options.name - Pet name for the mount.
 * @param {boolean} [options.readOnly] - Whether the mount is read-only.
 * @param {string} [options.agentNames] - Agent to act as.
 */
export const mount = async ({ sourcePath, name, agentNames, readOnly }) => {
  const parsedName = parsePetNamePath(name);
  const resolvedPath = path.resolve(sourcePath);

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).provideMount(resolvedPath, parsedName, { readOnly: readOnly || false });
    console.log(`Mounted ${resolvedPath} as ${name}`);
  });
};
