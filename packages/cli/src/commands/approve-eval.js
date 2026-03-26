/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseBigint } from '../number-parse.js';

export const approveEvalCommand = async ({
  messageNumberText,
  workerName,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).approveEvaluation(
      parseBigint(messageNumberText),
      workerName,
    );
  });
