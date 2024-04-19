/* global process */
import fs from 'fs';
import os from 'os';

import { makeNodeReader } from '@endo/stream-node';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';

export const store = async ({ storablePath, name, agentNames }) => {
  const nodeReadStream = fs.createReadStream(storablePath);
  const reader = makeNodeReader(nodeReadStream);
  const readerRef = makeReaderRef(reader);
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).storeBlob(readerRef, name);
  });
};
