/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';

export const adoptCommand = async ({
  messageNumberText,
  edgeName,
  name,
  partyNames,
}) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    // TODO less bad number parsing.
    const messageNumber = Number(messageNumberText);
    await E(party).adopt(messageNumber, edgeName, name);
  });
