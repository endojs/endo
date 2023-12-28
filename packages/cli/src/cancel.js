/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const cancelCommand = async ({ name, partyNames, reason }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).cancel(name, reason);
  });
