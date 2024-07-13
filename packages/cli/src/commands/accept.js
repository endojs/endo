/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

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
    await E(agent).accept(invitationLocator.trim(), guestName);
  });
};
