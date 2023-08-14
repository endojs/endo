import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const show = async ({
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
    const pet = await E(party).provide(name);
    console.log(pet);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
