/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoHost } from './context.js';

export const identify = async ({ name, displayJson, displayType }) =>
  withEndoHost({ os, process }, async ({ host: party }) => {
    const { type, number } = await E(party).identify(name);
    if (displayJson) {
      process.stdout.write(`${JSON.stringify({ type, number })}\n`);
    } else if (displayType) {
      process.stdout.write(`${type}:${number}\n`);
    } else {
      process.stdout.write(`${number}\n`);
    }
  });
