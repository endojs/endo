/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoHost } from '../context.js';

export const list = async ({ directoryName, special, all }) =>
  withEndoHost({ os, process }, async ({ host: party }) => {
    if (directoryName !== undefined) {
      party = E(party).lookup(directoryName);
    }
    const petNames = await (() => {
      if (all) return E(party).listAll();
      if (special) return E(party).listSpecial();
      return E(party).list();
    })();
    for await (const petName of petNames) {
      console.log(petName);
    }
  });
