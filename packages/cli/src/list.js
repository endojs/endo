/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const list = async ({ partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const petNames = await E(party).list();
    for await (const petName of petNames) {
      console.log(petName);
    }
  });
