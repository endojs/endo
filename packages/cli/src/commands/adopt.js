/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';
import { parseNumber } from '../number-parse.js';

export const adoptCommand = async ({
  messageNumberText,
  edgeName,
  name,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).adopt(
      parseNumber(messageNumberText),
      edgeName,
      parsePetNamePath(name),
    );
  });
