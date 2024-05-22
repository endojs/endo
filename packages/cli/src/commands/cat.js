/* global process */

import os from 'os';
import { E } from '@endo/far';
import { makeRefReader } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const cat = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const readable = await E(agent).lookup(...parsePetNamePath(name));
    const readerRef = E(readable).streamBase64();
    const reader = makeRefReader(readerRef);
    for await (const chunk of reader) {
      process.stdout.write(chunk);
    }
  });
