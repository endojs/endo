/* global process */

import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoParty } from '../context.js';

export const followCommand = async ({ name, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const iterable = await E(party).lookup(name);
    for await (const iterand of makeRefIterator(iterable)) {
      console.log(iterand);
    }
  });
