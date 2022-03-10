// @ts-check
import * as fs from 'fs';
import * as crypto from 'crypto';
import { checkBundle as powerlessCheckBundle } from './lite.js';
import { parseLocatedJson } from './src/json.js';

const textDecoder = new TextDecoder();

/** @param {Uint8Array} bytes */
const computeSha512 = bytes => {
  const hash = crypto.createHash('sha512');
  hash.update(bytes);
  return hash.digest().toString('hex');
};

/**
 * @param {any} bundle
 * @param {string=} name
 */
export const checkBundle = async (bundle, name = '<unknown-bundle>') => {
  return powerlessCheckBundle(bundle, computeSha512, name);
};

/**
 * @param {Uint8Array} bytes
 * @param {string=} name
 */
export const checkBundleBytes = async (bytes, name = '<unknown-bundle>') => {
  const text = textDecoder.decode(bytes);
  const bundle = await parseLocatedJson(text, name);
  harden(bundle);
  return powerlessCheckBundle(bundle, computeSha512, name);
};

/**
 * @param {string} path
 */
export const checkBundleFile = async path => {
  const bytes = await fs.promises.readFile(path);
  return checkBundleBytes(bytes, path);
};
