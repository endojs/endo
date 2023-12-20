/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoParty } from './context.js';
import { makeNodeReader } from '@endo/stream-node';

const readAll = async reader => {
  const chunks = [];
  for await (const chunk of reader) {
    chunks.push(chunk);
  }
  // TODO more portable idiom here:
  return Buffer.concat(chunks);
};

export const accept = async ({ guestName, partyNames }) => {
  const reader = makeNodeReader(process.stdin);
  const bytes = await readAll(reader);
  const text = new TextDecoder().decode(bytes);
  const invitation = JSON.parse(text);

  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    await E(party).accept(invitation, guestName);
  });
};
