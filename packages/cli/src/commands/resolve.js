/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const resolveCommand = async ({
  requestNumberText,
  resolutionName,
  agentNames,
}) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // TODO less bad number parsing.
    const requestNumber = Number(requestNumberText);
    await E(agent).resolve(requestNumber, resolutionName);
  });
