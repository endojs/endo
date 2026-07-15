// @ts-check
/* eslint-disable no-await-in-loop */

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
  const { maxDepth = MAX_DEPTH, ignored = ALWAYS_IGNORED, onFile } = options;

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

    return makeExo(
      'LocalTree',
      ReadableTreeInterface,
      /** @type {any} */ ({
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
         * Recursive listing of the subtree under the sub-path `petNamePath`
         * (a single name, a path of segments, or `[]` for the whole tree).
         * Returns every descendant as a `{ path, type }` record — `path`
         * relative to the queried node, lexically sorted, each directory
         * emitted before its own children. Symlinks and `.git` are skipped
         * (matching `list`); size and host stat fields are omitted (see
         * interfaces.js `recursiveListMethodGuards`). `options.ignore`
         * augments the tree's own ignore set for this call.
         *
         * @param {string | string[]} petNamePath
         * @param {{ ignore?: string[] }} [listTreeOptions]
         * @returns {Promise<Array<{ path: string[], type: 'file' | 'directory' }>>}
         */
        listTree: async (petNamePath, listTreeOptions = {}) => {
          const namePath =
            typeof petNamePath === 'string' ? [petNamePath] : petNamePath;
          const { ignore = [] } = listTreeOptions;
          // Augment (not replace) the tree's own ignore set for this call.
          const ignoredHere =
            ignore.length === 0 ? ignored : new Set([...ignored, ...ignore]);
          const startPath =
            namePath.length === 0
              ? currentPath
              : path.join(currentPath, ...namePath);

          /** @type {Array<{ path: string[], type: 'file' | 'directory' }>} */
          const entries = [];

          /**
           * @param {string} absPath
           * @param {string[]} relSegments
           * @param {number} walkDepth
           */
          const walk = async (absPath, relSegments, walkDepth) => {
            if (walkDepth > maxDepth) {
              throw new Error(
                `Maximum directory depth (${maxDepth}) exceeded at ${absPath}`,
              );
            }
            const dirEntries = await fs.promises.readdir(absPath, {
              withFileTypes: true,
            });
            const kept = dirEntries
              .filter(
                entry =>
                  !ignoredHere.has(entry.name) &&
                  !entry.isSymbolicLink() &&
                  (entry.isFile() || entry.isDirectory()),
              )
              // eslint-disable-next-line no-nested-ternary
              .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            for (const entry of kept) {
              const childRel = harden([...relSegments, entry.name]);
              if (entry.isDirectory()) {
                entries.push(harden({ path: childRel, type: 'directory' }));
                await walk(
                  path.join(absPath, entry.name),
                  childRel,
                  walkDepth + 1,
                );
              } else {
                entries.push(harden({ path: childRel, type: 'file' }));
              }
            }
          };

          await walk(startPath, [], 0);
          return harden(entries);
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
        /** @param {string} [method] */
        help: method =>
          method === undefined
            ? 'LocalTree: read-only view of a host directory tree (has, list, listTree, lookup).'
            : `No documentation for method ${method}.`,
      }),
    );
  };

  return makeTree(dirPath, 0);
};
harden(makeLocalTree);
