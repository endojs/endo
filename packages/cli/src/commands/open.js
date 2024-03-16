/* global process */

import os from 'os';

import openWebPage from 'open';
import { E } from '@endo/far';

import { withEndoParty } from '../context.js';

export const open = async ({ webletName, partyNames }) => {
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const weblet = E(party).lookup(webletName);
    const webletLocation = await E(weblet).getLocation();
    process.stdout.write(`${webletLocation}\n`);
    openWebPage(webletLocation);
  });
};
