import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const mkhost = async ({
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
    const newHost = await E(party).provideHost(name);
    console.log(newHost);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
