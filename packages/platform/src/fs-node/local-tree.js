// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import harden from '@endo/harden';
import { makeExo } from '@endo/exo';

import { ReadableTreeInterface } from '../fs/interfaces.js';
import { makeLocalBlob } from './local-blob.js';

const ALWAYS_IGNORED = harden(new Set(['.git']));

const MAX_DEPTH = 64;

/**
 * Creates a ReadableTree Exo from a local directory.
 * The returned object can be passed to checkinTree or sent over CapTP
 * to a remote daemon.
 *
 * @param {string} dirPath - Absolute path to the directory.
 * @param {{ maxDepth?: number, ignored?: Set<string>, onFile?: () => void }} [options]
 */
export const makeLocalTree = (dirPath, options = {}) => {
  const {
    maxDepth = MAX_DEPTH,
    ignored = ALWAYS_IGNORED,
    onFile,
  } = options;

  /**
   * @param {string} currentPath
   * @param {number} depth
   */
  const makeTree = (currentPath, depth) => {
    if (depth > maxDepth) {
      throw new Error(
        `Maximum directory depth (${maxDepth}) exceeded at ${currentPath}`,
      );
    }

    return makeExo('LocalTree', ReadableTreeInterface, {
      /**
       * @param {...string} names
       * @returns {Promise<boolean>}
       */
      has: async (...names) => {
        if (names.length === 0) return true;
        const [head] = names;
        const fullPath = path.join(currentPath, head);
        try {
          await fs.promises.access(fullPath);
          return true;
        } catch (_e) {
          return false;
        }
      },
      /** @returns {Promise<string[]>} */
      list: async () => {
        const dirEntries = await fs.promises.readdir(currentPath, {
          withFileTypes: true,
        });
        return dirEntries
          .filter(
            entry =>
              !ignored.has(entry.name) &&
              !entry.isSymbolicLink() &&
              (entry.isFile() || entry.isDirectory()),
          )
          .map(entry => entry.name)
          .sort();
      },
      /**
       * @param {string | string[]} petNamePath
       */
      lookup: async petNamePath => {
        const namePath =
          typeof petNamePath === 'string' ? [petNamePath] : petNamePath;
        const [head, ...tail] = namePath;
        const fullPath = path.join(currentPath, head);
        const stat = await fs.promises.stat(fullPath);

        /** @type {any} */
        let child;
        if (stat.isDirectory()) {
          child = makeTree(fullPath, depth + 1);
        } else {
          if (onFile) onFile();
          child = makeLocalBlob(fullPath);
        }

        if (tail.length === 0) {
          return child;
        }
        // Recursive path traversal via E() would require @endo/far import.
        // For local trees we can resolve directly since children are local.
        /** @type {any} */
        let current = child;
        for (const name of tail) {
          current = await current.lookup(name);
        }
        return current;
      },
    });
  };

  return makeTree(dirPath, 0);
};
harden(makeLocalTree);
