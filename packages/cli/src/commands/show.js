/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const show = async ({ name, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const pet = await E(party).lookup(name);
    console.log(pet);
  });
