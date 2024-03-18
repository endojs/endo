/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const mkguest = async ({ name, agentNames, introducedNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const newGuest = await E(agent).provideGuest(name, { introducedNames });
    console.log(newGuest);
  });
