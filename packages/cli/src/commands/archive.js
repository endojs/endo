/* global process */

import os from 'os';
import fs from 'fs';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import { E } from '@endo/far';
import { makeArchive as makeCompartmentArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { defaultParserForLanguage as sourceParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';
import { makeReaderRef } from '@endo/daemon';
import { withEndoAgent } from '../context.js';
import { parsePetNamePath } from '../pet-name.js';

/**
 * `endo archive <application-path>` command.
 *
 * Creates a source-only ZIP archive of the application at
 * `applicationPath` (a directory with a `package.json`) using
 * @endo/compartment-mapper's `makeArchive` with the source parsers
 * from `@endo/compartment-mapper/import-parsers.js`.  The archive is
 * stored as a readable blob on the specified agent.
 *
 * @param {object} args
 * @param {string} args.applicationPath - Path to the application
 *   directory (contains `package.json`).
 * @param {string | undefined} args.archiveName - Pet name to give the
 *   stored blob (optional).
 * @param {string[] | undefined} args.agentNames
 * @param {object} [args.archiveOptions] - Extra options passed to
 *   `makeArchive`.
 */
export const archiveCommand = async ({
  applicationPath,
  archiveName,
  agentNames,
  archiveOptions = {},
}) => {
  const readPowers = makeReadPowers({ fs, url, crypto, path });
  const moduleLocation = url.pathToFileURL(
    path.resolve(process.cwd(), applicationPath),
  ).href;
  const archiveBytes = await makeCompartmentArchive(
    readPowers,
    moduleLocation,
    {
      ...archiveOptions,
      parserForLanguage: sourceParserForLanguage,
    },
  );
  assert(archiveName === undefined || typeof archiveName === 'string');
  const archivePath = archiveName && parsePetNamePath(archiveName);
  const readerRef = makeReaderRef([archiveBytes]);
  process.stdout.write(`${archiveBytes.byteLength} bytes\n`);
  return withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await E(agent).storeBlob(readerRef, archivePath);
  });
};
