/* global process */

import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const request = async ({
  cancel,
  cancelled,
  sockPath,
  description,
  resultName,
  partyNames,
}) => {
  if (partyNames.length === 0) {
    console.error('Specify the name of a guest with -a or --as <guest>');
    process.exitCode = 1;
    return;
  }
  const { getBootstrap } = await provideEndoClient('cli', sockPath, cancelled);
  try {
    const bootstrap = getBootstrap();
    let party = E(bootstrap).host();
    for (const partyName of partyNames) {
      party = E(party).provideGuest(partyName);
    }
    const result = await E(party).request(description, resultName);
    console.log(result);
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
