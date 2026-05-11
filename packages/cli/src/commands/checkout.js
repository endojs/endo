/* global process */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { E } from '@endo/far';
import { checkoutTree } from '@endo/platform/fs/lite';
import { makeTreeWriter } from '@endo/platform/fs/node';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Check out a readable-tree from the daemon to a local directory.
 *
 * @param {object} options
 * @param {string} options.treeName - Pet name of the readable-tree.
 * @param {string} options.destPath - Local path to write to.
 * @param {string} [options.agentNames] - Agent to act as.
 */
export const checkout = async ({ treeName, destPath, agentNames }) => {
  const parsedName = parsePetNamePath(treeName);
  const resolvedPath = path.resolve(destPath);

  // Refuse to overwrite existing paths.
  try {
    await fs.promises.access(resolvedPath);
    throw new Error(`${resolvedPath} already exists`);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') {
      throw e;
    }
    // Path does not exist — good.
  }

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const tree = await E(agent).lookup(parsedName);
    const progress = { files: 0 };
    const writer = makeTreeWriter(resolvedPath);
    await checkoutTree(tree, writer, {
      onFile: () => {
        progress.files += 1;
      },
    });
    console.log(`  checked out ${progress.files} files`);
  });
};
