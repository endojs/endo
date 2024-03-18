/* global process */

import os from 'os';

import openWebPage from 'open';
import { E } from '@endo/far';

import { withEndoAgent } from '../context.js';

export const open = async ({ webletName, agentNames }) => {
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const weblet = E(agent).lookup(webletName);
    const webletLocation = await E(weblet).getLocation();
    process.stdout.write(`${webletLocation}\n`);
    openWebPage(webletLocation);
  });
};
