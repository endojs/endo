import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const copy = async ({ agentNames, sourcePath, targetPath }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).copy(
      parsePetNamePath(sourcePath),
      parsePetNamePath(targetPath),
    );
  });
