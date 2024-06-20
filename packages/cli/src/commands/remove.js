/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const remove = async ({ petNamePaths, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) =>
    Promise.all(
      petNamePaths.map(petNamePath =>
        E(agent).remove(...parsePetNamePath(petNamePath)),
      ),
    ),
  );
