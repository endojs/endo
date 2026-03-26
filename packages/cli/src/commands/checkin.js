/* global process */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { E } from '@endo/far';
import { makeLocalTree } from '@endo/platform/fs/node';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * Check in a local directory as a content-addressed readable-tree.
 *
 * The CLI builds a local Exo tree mirroring the filesystem and passes
 * it to the daemon's storeTree method. The daemon walks this tree over CapTP,
 * streaming each blob's content into its content store, and builds the
 * readable-tree formula content-addressed.
 *
 * @param {object} options
 * @param {string} options.sourcePath - Local directory to check in.
 * @param {string} options.name - Pet name for the root readable-tree.
 * @param {string} [options.agentNames] - Agent to act as.
 */
export const checkin = async ({ sourcePath, name, agentNames }) => {
  const parsedName = parsePetNamePath(name);

  const resolvedPath = path.resolve(sourcePath);
  const stat = await fs.promises.stat(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`${resolvedPath} is not a directory`);
  }

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const progress = { files: 0 };
    const localTree = makeLocalTree(resolvedPath, {
      onFile: () => {
        progress.files += 1;
      },
    });
    await E(agent).storeTree(localTree, parsedName);
    console.log(`  stored ${progress.files} files`);
  });
};
