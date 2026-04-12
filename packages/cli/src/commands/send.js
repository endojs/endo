/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseMessage } from '../message-parse.js';
import { parsePetNamePath } from '../pet-name.js';

export const send = async ({ message, agentName, agentNames }) => {
  const { strings, edgeNames, petNames } = parseMessage(message);
  const agentNamePath = parsePetNamePath(agentName);
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).send(agentNamePath, strings, edgeNames, petNames);
  });
};
