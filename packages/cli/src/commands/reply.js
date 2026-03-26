/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseMessage } from '../message-parse.js';
import { parseBigint } from '../number-parse.js';

export const reply = async ({ messageNumberText, message, agentNames }) => {
  const { strings, edgeNames, petNames } = parseMessage(message);
  const messageNumber = parseBigint(messageNumberText);
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).reply(messageNumber, strings, edgeNames, petNames);
  });
};
