/* global process */
import os from 'os';

import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Create a portable scratch space in the daemon state directory.
 *
 * Unlike `mount`, scratch spaces migrate with the state directory.
 * Unlike `mkdir`, they materialize as files on disk.
 *
 * @param {object} options
 * @param {string} options.name - Pet name for the scratch space.
 * @param {boolean} [options.readOnly] - Whether the mount is read-only.
 * @param {string} [options.agentNames] - Agent to act as.
 */
export const mktmp = async ({ name, agentNames, readOnly }) => {
  const parsedName = parsePetNamePath(name);

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).provideScratchMount(parsedName, {
      readOnly: readOnly || false,
    });
    console.log(`Created scratch space as ${name}`);
  });
};
