/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const invite = async ({ guestName, rsvpName, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const invitation = await E(party).invite(guestName, rsvpName);
    console.log(JSON.stringify(invitation, null, 2));
  });
