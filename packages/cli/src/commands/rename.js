/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const rename = async ({ fromName, toName, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).rename(fromName, toName);
  });
