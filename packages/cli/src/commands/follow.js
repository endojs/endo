/* global process */

import os from 'os';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const followCommand = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const iterable = await E(agent).lookup(...parsePetNamePath(name));
    for await (const iterand of iterateReader(iterable)) {
      console.log(iterand);
    }
  });
