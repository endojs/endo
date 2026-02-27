/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const locate = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const namePath = parsePetNamePath(name);
    const locator = await E(agent).locate(...namePath);
    if (locator === undefined) {
      console.error(`${name}: not found`);
      process.exitCode = 1;
      return;
    }
    console.log(locator);
  });
