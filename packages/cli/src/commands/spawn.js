/* eslint-disable no-await-in-loop */
/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const spawn = async ({ petNames, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) =>
    Promise.all(petNames.map(petName => E(agent).provideWorker(petName))),
  );
