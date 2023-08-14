import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const rename = async ({
  cancel,
  cancelled,
  sockPath,
  fromName,
  toName,
  partyNames,
}) => {
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    await E(party).rename(fromName, toName);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
