import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const remove = async ({
  cancel,
  cancelled,
  sockPath,
  petNames,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    await Promise.all(petNames.map(petName => E(party).remove(petName)));
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
