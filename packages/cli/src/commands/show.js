/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const show = async ({ name, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const namePath = parsePetNamePath(name);
    let pet = await E(agent).lookup(...namePath);
    if (typeof pet === 'string') {
      pet = pet.trim();
    }
    console.log(pet);
  });
