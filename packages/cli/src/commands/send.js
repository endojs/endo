/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from '../context.js';
import { parseMessage } from '../message-parse.js';

export const send = async ({ message, partyName, partyNames }) => {
  const { strings, edgeNames, petNames } = parseMessage(message);
  await withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).send(partyName, strings, edgeNames, petNames);
  });
};
