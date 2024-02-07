/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const killCommand = async ({ name, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).terminate(parsePetNamePath(name));
  });
