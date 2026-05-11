// @ts-check

import fs from 'node:fs';
import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { makeNodeReader } from '@endo/stream-node';

import { ReadableBlobInterface } from '../fs/interfaces.js';
import { makeReaderRef } from '../fs/reader-ref.js';

/**
 * Creates a ReadableBlob Exo from a local file.
 * Streams file content as base64 via @endo/stream-node.
 *
 * @param {string} filePath
 */
export const makeLocalBlob = filePath => {
  return makeExo('LocalBlob', ReadableBlobInterface, {
    streamBase64: () => {
      const nodeReadStream = fs.createReadStream(filePath);
      const reader = makeNodeReader(nodeReadStream);
      return makeReaderRef(reader);
    },
    text: () => fs.promises.readFile(filePath, 'utf-8'),
    json: async () => JSON.parse(await fs.promises.readFile(filePath, 'utf-8')),
  });
};
harden(makeLocalBlob);
