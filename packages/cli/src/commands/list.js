/* global process */
import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoHost } from '../context.js';

export const list = async ({ directoryPath, follow, json }) =>
  withEndoHost({ os, process }, async ({ host: party }) => {
    if (directoryPath !== undefined) {
      party = E(party).lookup(...directoryPath.split('.'));
    }
    if (follow) {
      const topic = await E(party).followNames();
      const iterator = makeRefIterator(topic);
      if (json) {
        for await (const change of iterator) {
          console.log(JSON.stringify(change));
        }
      } else {
        for await (const change of iterator) {
          if (change.add !== undefined) {
            console.log(`+${change.add}`);
          } else if (change.remove !== undefined) {
            console.log(`-${change.remove}`);
          }
        }
      }
    } else {
      const petNames = await E(party).list();
      for await (const petName of petNames) {
        console.log(petName);
      }
    }
  });
