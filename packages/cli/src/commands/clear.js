/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const clearCommand = async ({ agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).dismissAll();
  });
