import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const resolveCommand = async ({
  requestNumberText,
  resolutionName,
  partyNames,
}) => {
  // TODO less bad number parsing.
  const requestNumber = Number(requestNumberText);
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provide(partyName);
    }
    await E(party).resolve(requestNumber, resolutionName);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
