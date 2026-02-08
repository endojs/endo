/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';
import { parseBigint } from '../number-parse.js';

export const adoptCommand = async ({
  messageNumberText,
  edgeName,
  name,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).adopt(
      parseBigint(messageNumberText),
      edgeName,
      parsePetNamePath(name),
    );
  });
