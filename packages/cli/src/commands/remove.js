/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const remove = async ({ petNames, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) =>
    Promise.all(petNames.map(petName => E(agent).remove(petName))),
  );
