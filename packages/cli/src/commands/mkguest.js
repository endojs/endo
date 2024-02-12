/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const mkguest = async ({ name, partyNames, introducedNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const newGuest = await E(party).provideGuest(name, { introducedNames });
    console.log(newGuest);
  });
