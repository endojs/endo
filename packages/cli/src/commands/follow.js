/* global process */

import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const followCommand = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const iterable = await E(agent).lookup(...parsePetNamePath(name));
    for await (const iterand of makeRefIterator(iterable)) {
      console.log(iterand);
    }
  });
