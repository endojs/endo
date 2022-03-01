// @ts-check
import * as fs from 'fs';
import * as crypto from 'crypto';
import { checkBundle as powerlessCheckBundle } from './lite.js';

/** @param {Uint8Array} bytes */
const computeSha512 = bytes => {
  const hash = crypto.createHash('sha512');
  hash.update(bytes);
  return hash.digest().toString('hex');
};

/**
 * @param {string} path
 */
export const checkBundle = async path => {
  const bytes = await fs.promises.readFile(path);
  return powerlessCheckBundle(bytes, computeSha512, path);
};

/**
 * @param {Uint8Array} bytes
 * @param {string=} name
 */
export const checkBundleBytes = async (bytes, name = undefined) => {
  return powerlessCheckBundle(bytes, computeSha512, name);
};
