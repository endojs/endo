// @ts-check
import { readFile } from 'node:fs/promises';

import { parseEntries } from './entries.js';

/**
 * @import {
 *   HeaderEntry,
 *   NodeEntry,
 *   SessionEntry,
 *   SessionGraph,
 * } from '../types.js'
 */

/**
 * Reconstruct the transcript graph from a session file's raw text. Tolerates a
 * torn final line (see {@link parseEntries}).
 *
 * @param {string} text
 * @returns {SessionGraph}
 */
export const loadFromJsonl = text => {
  const { entries } = parseEntries(text);
  /** @type {HeaderEntry | null} */
  let header = null;
  /** @type {Map<string, NodeEntry>} */
  const byId = new Map();
  /** @type {Map<string | null, string[]>} */
  const childIds = new Map();

  for (const entry of entries) {
    if (entry.type === 'header') {
      if (header === null) {
        header = entry;
      }
    } else {
      byId.set(entry.id, entry);
      const siblings = childIds.get(entry.parentId);
      if (siblings === undefined) {
        childIds.set(entry.parentId, [entry.id]);
      } else {
        siblings.push(entry.id);
      }
    }
  }

  return { header, entries, byId, childIds };
};

/**
 * Walk the parent chain from a leaf entry to the root, returning the entries in
 * root-to-leaf order. Unknown or missing links stop the walk.
 *
 * @param {SessionGraph} graph
 * @param {string} leafId
 * @returns {NodeEntry[]}
 */
export const assemblePath = (graph, leafId) => {
  /** @type {NodeEntry[]} */
  const chain = [];
  const seen = new Set();
  /** @type {string | null} */
  let currentId = leafId;
  while (currentId !== null) {
    if (seen.has(currentId)) {
      // Defensive: a cycle from a corrupt file must not spin forever.
      break;
    }
    seen.add(currentId);
    const entry = graph.byId.get(currentId);
    if (entry === undefined) {
      break;
    }
    chain.push(entry);
    currentId = entry.parentId;
  }
  chain.reverse();
  return chain;
};

/**
 * Read and parse a session file from disk.
 *
 * @param {{ path: string, readFile?: (path: string) => Promise<Uint8Array> }} options
 * @returns {Promise<SessionGraph>}
 */
export const readSessionFile = async ({ path, readFile: read = readFile }) => {
  await null;
  let text = '';
  try {
    const bytes = await read(path);
    text = new TextDecoder().decode(bytes);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      throw error;
    }
  }
  return loadFromJsonl(text);
};
