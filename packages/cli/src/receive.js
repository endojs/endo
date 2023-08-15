/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';
import { parseMessage } from './message-parse.js';

export const receive = async ({ message, partyNames }) => {
  const { strings, edgeNames, petNames } = parseMessage(message);
  if (partyNames.length === 0) {
    console.error('Specify the name of a guest with -a or --as <guest>');
    process.exitCode = 1;
    return;
  }
  // The last party name must be a guest and will be created if not already
  // present.
  const lastPartyName = partyNames.pop();
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const guest = E(party).provideGuest(lastPartyName);
    await E(guest).receive(strings, edgeNames, petNames);
  });
};
