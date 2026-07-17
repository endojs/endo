import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const spawn = async ({ petNamePaths, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) =>
    Promise.all(
      petNamePaths.map(petNamePath =>
        E(agent).provideWorker(parsePetNamePath(petNamePath)),
      ),
    ),
  );
