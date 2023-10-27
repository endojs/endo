/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const killCommand = async ({ name, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).terminate(name);
  });
