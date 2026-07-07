import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

const fromAsync = async iterable => {
  const all = [];
  for await (const iterand of iterable) {
    all.push(iterand);
  }
  return all;
};

export const accept = async ({ guestName, agentNames }) => {
  await null;
  process.stdin.setEncoding('utf-8');
  const invitationLocator = (await fromAsync(process.stdin)).join('').trim();
  return withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // A slash-delimited guest name nests the accepted guest inside a
    // directory; the parent directory must already exist.
    await E(agent).accept(
      invitationLocator.trim(),
      parsePetNamePath(guestName),
    );
  });
};
