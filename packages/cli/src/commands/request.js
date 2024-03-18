/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const request = async ({
  description,
  toName,
  resultName,
  agentNames,
}) => {
  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const result = await E(agent).request(toName, description, resultName);
    console.log(result);
  });
};
