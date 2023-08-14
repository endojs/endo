import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const list = async ({ cancel, cancelled, sockPath, partyNames }) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    const petNames = await E(party).list();
    for await (const petName of petNames) {
      console.log(petName);
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
