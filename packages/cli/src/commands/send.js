/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseMessage } from '../message-parse.js';

export const send = async ({ message, agentName, agentNames }) => {
  const { strings, edgeNames, petNames } = parseMessage(message);
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).send(agentName, strings, edgeNames, petNames);
  });
};
