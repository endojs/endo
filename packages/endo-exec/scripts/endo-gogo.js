#! /usr/bin/env node
import 'endo-exec';

import { importLocation } from '@endo/compartment-mapper';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { createRequire } from 'node:module';

const readPowers = makeReadPowers({ fs, url, path });

/** @type {import('endo-exec').Main} */
export const main = async ([_self, script, ...args], env, powers) => {
  console.log(import.meta.url);
  const scriptResolved = path.resolve(process.cwd(), script);
  const scriptRequire = createRequire(url.pathToFileURL(scriptResolved));
  const importConfined = specifier => {
    const moduleResolved = scriptRequire.resolve(specifier);
    const moduleUrlString = url.pathToFileURL(moduleResolved).href;
    console.log({ moduleResolved, moduleUrlString });
    return importLocation(readPowers, moduleUrlString).then(x => x.namespace);
  };
  console.log({ scriptResolved });
  const stuff = await import(scriptResolved);
  console.log(stuff);
  const { main: scriptMain } = stuff;
  return scriptMain([script, ...args], env, {
    ...powers,
    importConfined,
  });
};
