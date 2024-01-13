/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoHost } from './context.js';

export const show = async ({ name, displayJson }) =>
  withEndoHost({ os, process }, async ({ host: party }) => {
    const value = await E(party).lookup(name);
    if (displayJson) {
      process.stdout.write(`${JSON.stringify(value)}\n`);
    } else {
      console.log(value);
    }
  });
