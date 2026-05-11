/* global globalThis, process */
import fs from 'fs';
import url from 'url';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import harden from '@endo/harden';
import { E, Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeArchive as makeCompartmentArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { defaultParserForLanguage as sourceParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';
import { makeRefReader } from '@endo/daemon';

import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

const endowments = harden({
  // See https://github.com/Agoric/agoric-sdk/issues/9515
  assert: globalThis.assert,
  E,
  Far,
  makeExo,
  M,
  TextEncoder,
  TextDecoder,
  URL,
  console,
});

/**
 * @param {Uint8Array} archiveBytes
 * @param {unknown} powersP
 * @param {unknown[]} args
 */
const runArchiveBytes = async (archiveBytes, powersP, args) => {
  const [{ parseArchive }, { defaultParserForLanguage }] = await Promise.all([
    import('@endo/compartment-mapper'),
    import('@endo/compartment-mapper/import-archive-all-parsers.js'),
  ]);
  const application = await parseArchive(archiveBytes, '<archive>', {
    parserForLanguage: defaultParserForLanguage,
  });
  const { namespace } = await application.import({ globals: endowments });
  const result = await /** @type {{main: Function}} */ (namespace).main(
    powersP,
    ...args,
  );
  if (result !== undefined) {
    console.log(result);
  }
};

export const run = async ({
  filePath,
  args,
  archiveName,
  importPath,
  powersName,
  agentNames,
  env = {},
}) => {
  if (
    filePath === undefined &&
    importPath === undefined &&
    archiveName === undefined
  ) {
    console.error('Specify at least one of --file, --archive, or --UNCONFINED');
    process.exitCode = 1;
    return;
  }

  await withEndoAgent(
    agentNames,
    { os, process },
    async ({ bootstrap, agent }) => {
      await null;

      // Inject environment variables into process.env for ephemeral runs
      for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
      }

      let powersP;
      if (powersName === '@none') {
        powersP = E(bootstrap).leastAuthority();
      } else if (
        powersName === '@host' ||
        powersName === '@agent' ||
        powersName === 'AGENT'
      ) {
        powersP = agent;
      } else if (powersName === '@endo') {
        powersP = bootstrap;
      } else {
        powersP = E(agent).provideGuest(powersName);
      }

      if (importPath !== undefined) {
        if (archiveName !== undefined) {
          console.error(
            'Must specify either --archive or --UNCONFINED, not both',
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
      } else if (archiveName !== undefined) {
        if (filePath !== undefined) {
          args.unshift(filePath);
        }
        // Stream the archive bytes from the daemon.
        const archiveNamePath = parsePetNamePath(archiveName);
        const readableP = E(agent).lookup(archiveNamePath);
        /** @type {Uint8Array[]} */
        const chunks = [];
        let total = 0;
        for await (const chunk of makeRefReader(
          /** @type {any} */ (await E(readableP).streamBase64()),
        )) {
          chunks.push(chunk);
          total += chunk.byteLength;
        }
        const archiveBytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          archiveBytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        await runArchiveBytes(archiveBytes, powersP, args);
      } else {
        // Build a source-only archive on the fly from the file path.
        const readPowers = makeReadPowers({ fs, url, crypto, path });
        const moduleLocation = url.pathToFileURL(
          path.resolve(/** @type {string} */ (filePath)),
        ).href;
        const archiveBytes = await makeCompartmentArchive(
          readPowers,
          moduleLocation,
          { parserForLanguage: sourceParserForLanguage },
        );
        await runArchiveBytes(archiveBytes, powersP, args);
      }
    },
  );
};
