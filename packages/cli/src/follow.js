import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { provideEndoClient } from './client.js';

export const followCommand = async ({
  cancel,
  cancelled,
  sockPath,
  name,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    const iterable = await E(party).provide(name);
    for await (const iterand of makeRefIterator(iterable)) {
      console.log(iterand);
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
