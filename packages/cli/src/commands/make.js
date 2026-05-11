/* global process */

import fs from 'fs';
import os from 'os';
import path from 'path';
import url from 'url';
import crypto from 'crypto';

import { makeArchive as makeCompartmentArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { defaultParserForLanguage as sourceParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';
import { makeReaderRef } from '@endo/daemon';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';
import { parseOptionalPetNamePath } from '../pet-name.js';
import { randomHex16 } from '../random.js';

export const makeCommand = async ({
  filePath,
  importPath,
  resultName,
  archiveName,
  workerName,
  agentNames,
  powersName,
  env,
}) => {
  await null;
  if (filePath !== undefined && importPath !== undefined) {
    console.error('Specify only one of [file] or --UNCONFINED <file>');
    process.exitCode = 1;
    return;
  }
  if (
    filePath === undefined &&
    importPath === undefined &&
    archiveName === undefined
  ) {
    console.error(
      'Specify at least one of [file], --archive <name>, or --UNCONFINED <file>',
    );
    process.exitCode = 1;
    return;
  }

  const resultPath = parseOptionalPetNamePath(resultName);

  /** @type {import('@endo/eventual-send').FarRef<import('@endo/stream').Reader<string>> | undefined} */
  let archiveReaderRef;
  /** @type {string | undefined} */
  let temporaryArchiveName;
  if (filePath !== undefined) {
    if (archiveName === undefined) {
      // TODO alternately, make a temporary session-scoped GC pet store
      // overshadowing the permanent one, which gets implicitly dropped
      // when this CLI CapTP session ends.
      temporaryArchiveName = `tmp-archive-${await randomHex16()}`;
      archiveName = temporaryArchiveName;
    }
    const readPowers = makeReadPowers({ fs, url, crypto, path });
    const moduleLocation = url.pathToFileURL(path.resolve(filePath)).href;
    const archiveBytes = await makeCompartmentArchive(
      readPowers,
      moduleLocation,
      { parserForLanguage: sourceParserForLanguage },
    );
    archiveReaderRef = makeReaderRef([archiveBytes]);
  }

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await null;
    // Prepare an archive, with the given name.
    if (archiveReaderRef !== undefined) {
      await E(agent).storeBlob(archiveReaderRef, archiveName);
    }

    let resultP;
    if (importPath !== undefined) {
      // makeUnconfined is unconditionally Node-scoped; default to
      // the host's @node worker when no other worker is named.
      const unconfinedWorkerName = workerName ?? '@node';
      resultP = E(agent).makeUnconfined(
        unconfinedWorkerName,
        url.pathToFileURL(path.resolve(importPath)).href,
        { powersName, resultName: resultPath, env },
      );
    } else {
      resultP = E(agent).makeArchive(workerName, archiveName, {
        powersName,
        resultName: resultPath,
        env,
      });
    }
    let result;
    try {
      result = await resultP;
      console.log(result);
    } finally {
      if (temporaryArchiveName) {
        await E(agent).remove(temporaryArchiveName);
      }
    }
    return result;
  });
};
