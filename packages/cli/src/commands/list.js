/* global process */
import os from 'os';
import { inspect } from 'util';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoHost } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

const prettyValue = val => {
  let result;
  const type = typeof val;
  if (type === 'string') {
    result = `'${val}'`;
  } else if (type === 'object') {
    result = `${val}`;
    const noise = '[object Alleged: ';
    if (result.startsWith(noise)) {
      result = result.substring(noise.length);
      result = result.substring(0, result.length - 1);
    } else {
      result = inspect(val);
    }
  } else {
    result = inspect(val);
  }
  return result;
};

const pad = (fieldVal, width, minPad = 2) => {
  let spaces = width - `${fieldVal}`.length;
  if (spaces < minPad) {
    spaces = minPad;
  }
  return ' '.repeat(spaces);
};

export const list = async ({ directory, follow, json, verbose }) =>
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
        if (verbose) {
          const val = await E(agent).lookup(petName);
          console.log(`${petName}${pad(petName, 20)}${prettyValue(val)}`);
        } else {
          console.log(petName);
        }
      }
    }
  });
