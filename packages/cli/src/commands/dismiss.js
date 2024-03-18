/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const dismissCommand = async ({ messageNumberText, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    // TODO less bad number parsing.
    const messageNumber = Number(messageNumberText);
    await E(agent).dismiss(messageNumber);
  });
