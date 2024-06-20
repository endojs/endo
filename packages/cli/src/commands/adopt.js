/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const adoptCommand = async ({
  messageNumberText,
  edgeName,
  name,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // TODO less bad number parsing.
    const messageNumber = Number(messageNumberText);
    await E(agent).adopt(messageNumber, edgeName, parsePetNamePath(name));
  });
