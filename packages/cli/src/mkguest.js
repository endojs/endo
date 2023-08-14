import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const mkguest = async ({
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
    const newGuest = await E(party).provideGuest(name);
    console.log(newGuest);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
