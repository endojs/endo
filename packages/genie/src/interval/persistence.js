// @ts-check

/**
 * @module interval/persistence
 *
 * Atomic file persistence for interval entries.
 * Uses write-then-rename pattern for crash safety.
 */

/** @import { IntervalEntry } from './types.js' */

import { getRandomValues } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Generate a short random hex string for entry IDs and temp files.
 *
 * @param {number} [bytes] - Number of random bytes (default 4 = 8 hex chars).
 * @returns {string}
 */
const randomHex = (bytes = 4) => {
  const arr = new Uint8Array(bytes);
  // Node crypto.getRandomValues polyfill
  // eslint-disable-next-line no-restricted-globals
  getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Ensure the intervals directory exists.
 *
 * @param {string} dir
 */
const ensureDir = async dir => {
  await fs.mkdir(dir, { recursive: true });
};

/**
 * Atomically write a JSON file using write-then-rename.
 *
 * @param {string} dir - Target directory.
 * @param {string} fileName - Final file name.
 * @param {object} value - JSON-serialisable value.
 */
const atomicWriteJSON = async (dir, fileName, value) => {
  const temporaryPath = join(dir, `.tmp.${randomHex()}`);
  const finalPath = join(dir, fileName);
  await fs.writeFile(temporaryPath, `${JSON.stringify(value)}\n`, 'utf-8');
  await fs.rename(temporaryPath, finalPath);
};

/**
 * Read a single interval entry from disk.
 *
 * @param {string} dir - Intervals directory.
 * @param {string} id - Entry ID (without .json extension).
 * @returns {Promise<IntervalEntry | undefined>}
 */
const readEntry = async (dir, id) => {
  await Promise.resolve();
  try {
    const raw = await fs.readFile(join(dir, `${id}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
};

/**
 * Persist an interval entry to disk atomically.
 *
 * @param {string} dir - Intervals directory.
 * @param {IntervalEntry} entry
 */
const writeEntry = async (dir, entry) => {
  await atomicWriteJSON(dir, `${entry.id}.json`, entry);
};

/**
 * Read all interval entries from the intervals directory.
 *
 * @param {string} dir - Intervals directory.
 * @returns {Promise<IntervalEntry[]>}
 */
const readAllEntries = async dir => {
  await Promise.resolve();
  /** @type {IntervalEntry[]} */
  const entries = [];

  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('.tmp.')) {
        // eslint-disable-next-line no-await-in-loop
        const raw = await fs.readFile(join(dir, file), 'utf-8');
        entries.push(JSON.parse(raw));
      }
    }
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') {
      return entries;
    }
    throw e;
  }
  return entries;
};

/**
 * Delete an interval entry file from disk.
 *
 * @param {string} dir - Intervals directory.
 * @param {string} id - Entry ID.
 */
const deleteEntry = async (dir, id) => {
  await Promise.resolve();
  try {
    await fs.unlink(join(dir, `${id}.json`));
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') {
      throw e;
    }
  }
};

export {
  randomHex,
  ensureDir,
  atomicWriteJSON,
  readEntry,
  writeEntry,
  readAllEntries,
  deleteEntry,
};
