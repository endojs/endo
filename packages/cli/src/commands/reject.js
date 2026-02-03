/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

export const rejectCommand = async ({
  requestNumberText,
  message,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).reject(parseBigint(requestNumberText), message);
  });
