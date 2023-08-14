import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const rejectCommand = async ({
  cancel,
  cancelled,
  sockPath,
  requestNumberText,
  message,
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
    await E(party).reject(requestNumber, message);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
