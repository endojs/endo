import fs from 'fs';

import { makeNodeReader } from '@endo/stream-node';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const store = async ({
  cancel,
  cancelled,
  sockPath,
  storablePath,
  name,
  partyNames,
}) => {
  const nodeReadStream = fs.createReadStream(storablePath);
  const reader = makeNodeReader(nodeReadStream);
  const readerRef = makeReaderRef(reader);

  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    await E(party).store(readerRef, name);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
