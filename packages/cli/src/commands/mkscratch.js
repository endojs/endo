/* global process */
import os from 'os';

import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Create a daemon-managed scratch mount.
 *
 * @param {object} options
 * @param {string} options.name - Pet name for the scratch mount.
 * @param {boolean} [options.readOnly] - Whether the mount is read-only.
 * @param {string} [options.agentNames] - Agent to act as.
 */
export const mkscratch = async ({ name, agentNames, readOnly }) => {
  const parsedName = parsePetNamePath(name);

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).provideScratchMount(parsedName, {
      readOnly: readOnly || false,
    });
    console.log(`Created scratch mount as ${name}`);
  });
};
