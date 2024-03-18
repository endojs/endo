/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const cancelCommand = async ({ name, agentNames, reason }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).cancel(name, reason);
  });
