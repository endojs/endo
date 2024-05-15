/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const mkdir = async ({ agentNames, directoryPath }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).makeDirectory(...parsePetNamePath(directoryPath));
  });
