/* global process */
import url from 'url';
import os from 'os';
import { E, Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import bundleSource from '@endo/bundle-source';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

const endowments = harden({
  assert,
  E,
  Far,
  makeExo,
  M,
  TextEncoder,
  TextDecoder,
  URL,
  console,
});

export const run = async ({
  filePath,
  args,
  bundleName,
  importPath,
  powersName,
  agentNames,
}) => {
  if (
    filePath === undefined &&
    importPath === undefined &&
    bundleName === undefined
  ) {
    console.error('Specify at least one of --file, --bundle, or --UNCONFINED');
    process.exitCode = 1;
    return;
  }

  await withEndoAgent(
    agentNames,
    { os, process },
    async ({ bootstrap, agent }) => {
      let powersP;
      if (powersName === 'NONE') {
        powersP = E(bootstrap).leastAuthority();
      } else if (powersName === 'HOST') {
        powersP = agent;
      } else if (powersName === 'ENDO') {
        powersP = bootstrap;
      } else {
        powersP = E(agent).provideGuest(powersName);
      }

      if (importPath !== undefined) {
        if (bundleName !== undefined) {
          console.error(
            'Must specify either --bundle or --UNCONFINED, not both',
          );
          process.exitCode = 1;
          return;
        }
        if (filePath !== undefined) {
          args.unshift(filePath);
        }

        const importUrl = url.pathToFileURL(importPath).href;
        const namespace = await import(importUrl);
        const result = await namespace.main(powersP, ...args);
        if (result !== undefined) {
          console.log(result);
        }
      } else {
        /** @type {any} */
        let bundle;
        if (bundleName !== undefined) {
          if (importPath !== undefined) {
            console.error(
              'Must specify either --bundle or --UNCONFINED, not both',
            );
            process.exitCode = 1;
            return;
          }
          if (filePath !== undefined) {
            args.unshift(filePath);
          }

          const bundleNamePath = parsePetNamePath(bundleName);
          const readableP = E(agent).lookup(...bundleNamePath);
          const bundleText = await E(readableP).text();
          bundle = JSON.parse(bundleText);
        } else {
          bundle = await bundleSource(filePath);
        }

        // We defer importing the import-bundle machinery to this in order to
        // avoid an up-front cost for workers that never use importBundle.
        const { importBundle } = await import('@endo/import-bundle');
        const namespace = await importBundle(bundle, {
          endowments,
        });
        const result = await namespace.main(powersP, ...args);
        if (result !== undefined) {
          console.log(result);
        }
      }
    },
  );
};
