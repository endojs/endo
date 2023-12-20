/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const mkhost = async ({ name, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const newHost = await E(party).provideHost(name);
    console.log(newHost);
  });
