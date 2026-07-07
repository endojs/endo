import fs from 'fs';
import os from 'os';
import path from 'path';
import url from 'url';
import crypto from 'crypto';

import { makeArchive as makeCompartmentArchive } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { defaultParserForLanguage as sourceParserForLanguage } from '@endo/compartment-mapper/import-parsers.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { E } from '@endo/eventual-send';
import { withEndoAgent } from '../context.js';
import { parseOptionalPetNamePath } from '../pet-name.js';
import { randomHex16 } from '../random.js';

/** @import { PassableBytesReader } from '@endo/exo-stream' */

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
  // A slash-delimited powers name references powers nested in a
  // directory; the parent directory must already exist (as with
  // `mkdir`, `store`, and `mv`).
  const powersPath = parseOptionalPetNamePath(powersName);

  /** @type {PassableBytesReader | undefined} */
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
    archiveReaderRef = bytesReaderFromIterator([archiveBytes]);
  }

  // A slash-delimited archive name references (or stores) the source
  // archive nested in a directory; the parent directory must already
  // exist (as with `mkdir`, `store`, and `mv`).
  const archivePath = parseOptionalPetNamePath(archiveName);

  await withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    await null;
    // Prepare an archive, with the given name.
    if (archiveReaderRef !== undefined) {
      await E(agent).storeBlob(archiveReaderRef, archivePath);
    }

    // A slash-delimited worker name references a worker nested in a
    // directory; the parent directory must already exist (as with
    // `mkdir`, `store`, and `mv`).
    const workerPath = parseOptionalPetNamePath(workerName);

    let resultP;
    if (importPath !== undefined) {
      // makeUnconfined is unconditionally Node-scoped; default to
      // the host's @node worker when no other worker is named.
      const unconfinedWorkerName = workerPath ?? '@node';
      resultP = E(agent).makeUnconfined(
        unconfinedWorkerName,
        url.pathToFileURL(path.resolve(importPath)).href,
        { powersName: powersPath, resultName: resultPath, env },
      );
    } else {
      resultP = E(agent).makeArchive(workerPath, archivePath, {
        powersName: powersPath,
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
