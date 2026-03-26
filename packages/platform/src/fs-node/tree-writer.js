// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import harden from '@endo/harden';
import { makeExo } from '@endo/exo';

import { TreeWriterInterface } from '../fs/interfaces.js';

/**
 * Creates a TreeWriter Exo that writes to a local directory.
 *
 * @param {string} dirPath - Root directory to write into.
 */
export const makeTreeWriter = dirPath => {
  return makeExo('TreeWriter', TreeWriterInterface, {
    /**
     * @param {string[]} pathSegments
     * @param {AsyncIterable<Uint8Array>} readable
     */
    writeBlob: async (pathSegments, readable) => {
      const filePath = path.join(dirPath, ...pathSegments);
      const parentDir = path.dirname(filePath);
      await fs.promises.mkdir(parentDir, { recursive: true });
      const chunks = [];
      for await (const chunk of readable) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      await fs.promises.writeFile(filePath, buffer);
    },
    /**
     * @param {string[]} pathSegments
     */
    makeDirectory: async pathSegments => {
      await fs.promises.mkdir(path.join(dirPath, ...pathSegments), {
        recursive: true,
      });
    },
  });
};
harden(makeTreeWriter);
