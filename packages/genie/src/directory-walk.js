// @ts-check

/**
 * Generic async-generator utility for walking an endo directory tree
 * depth-first.  Not agent-specific — works on any endo directory.
 *
 * @module
 */

import { E } from '@endo/eventual-send';

/**
 * @typedef {object} DirectoryEntry
 * @property {string} name - Leaf name of the entry.
 * @property {number} depth - Zero-based depth relative to the root.
 * @property {string[]} path - Full pet-name path from the root.
 */

/**
 * Walk an endo directory tree depth-first, yielding each entry with
 * its depth.
 *
 * @param {import('@endo/eventual-send').FarRef<import('@endo/daemon').EndoGuest>} powers
 * @param {string} dirName - Root directory pet name.
 * @param {number} [maxDepth] - Optional depth limit (default: Infinity).
 * @yields {DirectoryEntry}
 * @returns {AsyncGenerator<DirectoryEntry, void, undefined>}
 */
async function* walkDirectory(powers, dirName, maxDepth = Infinity) {
  /** @type {Array<{ path: string[], depth: number }>} */
  const stack = [{ path: [dirName], depth: 0 }];
  while (stack.length > 0) {
    const frame = /** @type {{ path: string[], depth: number }} */ (
      stack.pop()
    );
    const { path, depth } = frame;
    const names = /** @type {string[]} */ (await E(powers).list(path));
    for (const name of names) {
      const entryPath = [...path, name];
      yield { name, depth, path: entryPath };
      if (depth + 1 < maxDepth) {
        // Check if the entry is itself a directory by probing its
        // interface.
        try {
          const entry = await E(powers).lookup(entryPath);
          const methods = /** @type {string[]} */ (
            await E(entry).__getMethodNames__()
          );
          if (methods.includes('list')) {
            stack.push({ path: entryPath, depth: depth + 1 });
          }
        } catch {
          // Not a directory or inaccessible — skip.
        }
      }
    }
  }
}
harden(walkDirectory);

export { walkDirectory };
