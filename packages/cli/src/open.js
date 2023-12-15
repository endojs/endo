/* global process */

import os from 'os';

import openWebPage from 'open';
import { E } from '@endo/far';

import { withEndoParty } from './context.js';

export const open = async ({ webPageName, partyNames }) => {
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const { url: webPageUrl } = await E(party).lookup(webPageName);
    process.stdout.write(`${webPageUrl}\n`);
    openWebPage(webPageUrl);
  });
};
