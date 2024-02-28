/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoHost } from '../context.js';

export const list = async ({ directoryPath }) =>
  withEndoHost({ os, process }, async ({ host: party }) => {
    if (directoryPath !== undefined) {
      party = E(party).lookup(...directoryPath.split('.'));
    }
    const petNames = await E(party).list();
    for await (const petName of petNames) {
      console.log(petName);
    }
  });
