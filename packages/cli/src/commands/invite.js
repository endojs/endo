/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const invite = async ({ guestName, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const invitation = await E(agent).invite(guestName);
    const locator = await E(invitation).locate();
    console.log(locator);
  });
