/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const move = async ({ fromPath, toPath, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).move(fromPath, toPath);
  });
