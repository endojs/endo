/* global process */

import os from 'os';
import { E } from '@endo/far';
import { iterateStream } from '@endo/exo-stream/iterate-stream.js';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const followCommand = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const iterable = await E(agent).lookup(...parsePetNamePath(name));
    for await (const iterand of iterateStream(iterable)) {
      console.log(iterand);
    }
  });
