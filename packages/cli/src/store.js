/* global process */
import fs from 'fs';
import os from 'os';

import { makeNodeReader } from '@endo/stream-node';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';

import { withEndoParty } from './context.js';

export const store = async ({ storablePath, name, partyNames }) => {
  const nodeReadStream = fs.createReadStream(storablePath);
  const reader = makeNodeReader(nodeReadStream);
  const readerRef = makeReaderRef(reader);
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).store(readerRef, name);
  });
};
