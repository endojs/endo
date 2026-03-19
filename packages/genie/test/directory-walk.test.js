// @ts-check

/**
 * Tests for the generic endo directory tree walker.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { walkDirectory } from '../src/directory-walk.js';

/**
 * Build a mock powers object that simulates an endo namespace with
 * nested directories.
 *
 * @param {Record<string, string[] | Record<string, string[]>>} tree
 *   A flat map of JSON-encoded path -> list of child names.
 *   Entries whose values are arrays are leaf directories.
 */
const makeMockPowers = tree => {
  /**
   * Resolve a pet-name path to its key in the tree map.
   *
   * @param {string | string[]} petNamePath
   * @returns {string}
   */
  const toKey = petNamePath => {
    const parts = Array.isArray(petNamePath) ? petNamePath : [petNamePath];
    return JSON.stringify(parts);
  };

  /** @type {Set<string>} */
  const directoryPaths = new Set();

  // Pre-compute which paths are directories (have children).
  for (const key of Object.keys(tree)) {
    directoryPaths.add(key);
  }

  return harden({
    /**
     * @param {string | string[]} petNamePath
     * @returns {Promise<string[]>}
     */
    list: async petNamePath => {
      const key = toKey(petNamePath);
      const children = tree[key];
      if (!children) {
        throw new Error(`No such directory: ${key}`);
      }
      return /** @type {string[]} */ (children);
    },

    /**
     * @param {string | string[]} petNamePath
     * @returns {Promise<object>}
     */
    lookup: async petNamePath => {
      const parts = Array.isArray(petNamePath)
        ? petNamePath
        : [petNamePath];
      // Return a mock object whose __getMethodNames__ indicates
      // whether this path is a directory.
      const key = JSON.stringify(parts);
      const isDir = directoryPaths.has(key);
      return harden({
        __getMethodNames__: async () =>
          isDir ? ['list', 'lookup', 'has'] : ['locate', 'send'],
      });
    },
  });
};

test('walkDirectory yields entries from a flat directory', async t => {
  const powers = makeMockPowers({
    '["agents"]': ['alice', 'bob', 'charlie'],
  });

  /** @type {import('../src/directory-walk.js').DirectoryEntry[]} */
  const entries = [];
  for await (const entry of walkDirectory(powers, 'agents')) {
    entries.push(entry);
  }

  t.is(entries.length, 3);
  t.deepEqual(
    entries.map(e => e.name),
    ['alice', 'bob', 'charlie'],
  );
  t.deepEqual(
    entries.map(e => e.depth),
    [0, 0, 0],
  );
  t.deepEqual(entries[0].path, ['agents', 'alice']);
  t.deepEqual(entries[2].path, ['agents', 'charlie']);
});

test('walkDirectory recurses into nested directories', async t => {
  const powers = makeMockPowers({
    '["root"]': ['a', 'b'],
    '["root","a"]': ['a1', 'a2'],
    '["root","b"]': ['b1'],
    '["root","a","a1"]': ['deep'],
  });

  /** @type {import('../src/directory-walk.js').DirectoryEntry[]} */
  const entries = [];
  for await (const entry of walkDirectory(powers, 'root')) {
    entries.push(entry);
  }

  const names = entries.map(e => e.name);
  // All entries should be yielded.
  t.true(names.includes('a'));
  t.true(names.includes('b'));
  t.true(names.includes('a1'));
  t.true(names.includes('a2'));
  t.true(names.includes('b1'));
  t.true(names.includes('deep'));
  t.is(entries.length, 6);
});

test('walkDirectory respects maxDepth', async t => {
  const powers = makeMockPowers({
    '["root"]': ['a'],
    '["root","a"]': ['nested'],
    '["root","a","nested"]': ['deep'],
  });

  // maxDepth=1 should only yield depth 0 entries and not recurse into
  // nested directories at depth 1.
  /** @type {import('../src/directory-walk.js').DirectoryEntry[]} */
  const entries = [];
  for await (const entry of walkDirectory(powers, 'root', 1)) {
    entries.push(entry);
  }

  t.is(entries.length, 1);
  t.is(entries[0].name, 'a');
  t.is(entries[0].depth, 0);
});

test('walkDirectory yields nothing for an empty directory', async t => {
  const powers = makeMockPowers({
    '["empty"]': [],
  });

  /** @type {import('../src/directory-walk.js').DirectoryEntry[]} */
  const entries = [];
  for await (const entry of walkDirectory(powers, 'empty')) {
    entries.push(entry);
  }

  t.is(entries.length, 0);
});

test('walkDirectory handles lookup errors gracefully', async t => {
  // A directory where lookup always throws — entries should still be
  // yielded, just not recursed into.
  const powers = harden({
    list: async () => ['child'],
    lookup: async () => {
      throw new Error('inaccessible');
    },
  });

  /** @type {import('../src/directory-walk.js').DirectoryEntry[]} */
  const entries = [];
  for await (const entry of walkDirectory(
    /** @type {any} */ (powers),
    'dir',
  )) {
    entries.push(entry);
  }

  t.is(entries.length, 1);
  t.is(entries[0].name, 'child');
});
