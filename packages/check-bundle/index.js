// @ts-check
import * as fs from 'fs';
import * as crypto from 'crypto';
import { checkBundle as checkBundleBytes } from './lite.js';

/** @param {Uint8Array} bytes */
const computeSha512 = bytes => {
  const hash = crypto.createHash('sha512');
  hash.update(bytes);
  return hash.digest().toString('hex');
};

/**
 * @param {string} path
 * @param {string=} name
 */
export const checkBundle = async (path, name = undefined) => {
  const bytes = await fs.promises.readFile(path);
  return checkBundleBytes(bytes, computeSha512, name);
};
