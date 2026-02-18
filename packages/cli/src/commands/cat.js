/* global process */

import os from 'os';
import { E } from '@endo/far';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const cat = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const readable = await E(agent).lookup(...parsePetNamePath(name));
    const readerRef = E(readable).streamBase64();
    const reader = await iterateBytesReader(readerRef);
    for await (const chunk of reader) {
      process.stdout.write(chunk);
    }
  });
