// @ts-check

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} StorageProvider
 * @property {() => Record<string, any> | undefined} get
 * @property {(value: Record<string, any>) => void} set
 * @property {() => void} clear
 */

/**
 * Create a synchronous JSON file-backed storage provider.
 * Returns `undefined` if the file does not exist or is empty.
 *
 * @param {string} storageFilePath
 * @returns {StorageProvider}
 */
export const makeFileStorageProvider = storageFilePath => {
  return {
    get: () => {
      try {
        if (!existsSync(storageFilePath)) {
          return undefined;
        }
        const raw = readFileSync(storageFilePath, 'utf8');
        if (raw.trim() === '') {
          return undefined;
        }
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : {};
      } catch (error) {
        console.error('Error reading storage file', error);
        return undefined;
      }
    },
    set: value => {
      try {
        mkdirSync(path.dirname(storageFilePath), { recursive: true });
        writeFileSync(storageFilePath, JSON.stringify(value, null, 2), 'utf8');
      } catch (error) {
        console.error('Error writing storage file', error);
        throw error;
      }
    },
    clear: () => {
      try {
        unlinkSync(storageFilePath);
      } catch (error) {
        console.error('Error clearing storage file', error);
        throw error;
      }
    },
  };
};
