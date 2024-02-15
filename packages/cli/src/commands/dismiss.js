/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const dismissCommand = async ({ messageNumberText, partyNames }) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    // TODO less bad number parsing.
    const messageNumber = Number(messageNumberText);
    await E(party).dismiss(messageNumber);
  });
