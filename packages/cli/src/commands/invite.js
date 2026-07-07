import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const invite = async ({ guestName, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // A slash-delimited guest name nests the invitation (and the
    // redeemed guest) inside a directory; the parent must already exist.
    const invitation = await E(agent).invite(parsePetNamePath(guestName));
    const locator = await E(invitation).locate();
    console.log(locator);
  });
