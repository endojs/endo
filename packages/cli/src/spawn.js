/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import { provideEndoClient } from './client.js';

export const spawn = async ({
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
    for (const petName of petNames) {
      await E(party).makeWorker(petName);
    }
  } catch (error) {
    console.error(error);
    cancel(error);
  }
};
