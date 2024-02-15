/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';

export const rejectCommand = async ({
  requestNumberText,
  message,
  partyNames,
}) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    // TODO less bad number parsing.
    const requestNumber = Number(requestNumberText);
    await E(party).reject(requestNumber, message);
  });
