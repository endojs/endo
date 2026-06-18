// @ts-check

import fs from 'node:fs';
import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { makeExo } from '@endo/exo';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
import { mapReader } from '@endo/stream';
import { makeNodeReader } from '@endo/stream-node';

import { ReadableBlobInterface } from '../fs/interfaces.js';

/**
 * Creates a ReadableBlob Exo from a local file.
 * Streams file content as base64 via @endo/stream-node.
 *
 * @param {string} filePath
 */
export const makeLocalBlob = filePath => {
  return makeExo('LocalBlob', ReadableBlobInterface, {
    /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
    streamBase64(synPromise) {
      const nodeReadStream = fs.createReadStream(filePath);
      const reader = makeNodeReader(nodeReadStream);
      const pump = makeReaderPump(mapReader(reader, encodeBase64));
      return pump(/** @type {any} */ (synPromise));
    },
    text: () => fs.promises.readFile(filePath, 'utf-8'),
    json: async () => JSON.parse(await fs.promises.readFile(filePath, 'utf-8')),
  });
};
harden(makeLocalBlob);
