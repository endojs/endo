/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoHost } from '../context.js';

export const list = async ({ directoryName }) =>
  withEndoHost({ os, process }, async ({ party }) => {
    if (directoryName !== undefined) {
      party = E(party).lookup(directoryName);
    }
    const petNames = await E(party).list();
    for await (const petName of petNames) {
      console.log(petName);
    }
  });
