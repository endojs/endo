/* global process */

import { E } from '@endo/far';
import { makeRefReader } from '@endo/daemon';
import { provideEndoClient } from './client.js';

export const cat = async ({
  cancel,
  cancelled,
  sockPath,
  name,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient(
    'cli',
    sockPath,
    cancelled,
    name,
    partyNames,
  );
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    const readable = await E(party).provide(name);
    const readerRef = E(readable).stream();
    const reader = makeRefReader(readerRef);
    for await (const chunk of reader) {
      process.stdout.write(chunk);
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
