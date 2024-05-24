/* global process */
import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoHost } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

export const list = async ({ directory, follow, json }) =>
  withEndoHost({ os, process }, async ({ host: agent }) => {
    if (directory !== undefined) {
      const directoryPath = parsePetNamePath(directory);
      agent = E(agent).lookup(...directoryPath);
    }
    if (follow) {
      const topic = await E(agent).followNameChanges();
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
      const petNames = await E(agent).list();
      for await (const petName of petNames) {
        console.log(petName);
      }
    }
  });
