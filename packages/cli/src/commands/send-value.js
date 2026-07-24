import os from 'os';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

export const sendValueCommand = async ({
  messageNumberText,
  petName,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).sendValue(parseBigint(messageNumberText), petName);
  });
