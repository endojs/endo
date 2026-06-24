// @ts-check
/* eslint-disable no-await-in-loop */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { makeBrowserTree, checkoutToDirectory } from '../../browser-tree.js';

const MockTreeI = M.interface('MockTree', {
  list: M.call().returns(M.any()),
  lookup: M.call(M.string()).returns(M.any()),
});

/**
 * Create a mock FileSystemFileHandle.
 *
 * @param {string} content - Text content of the file.
 * @returns {FileSystemFileHandle}
 */
const mockFileHandle = content =>
  /** @type {any} */ ({
    kind: 'file',
    getFile: async () => {
      const blob = new Blob([content]);
      return blob;
    },
  });

/**
 * Create a mock FileSystemDirectoryHandle with a flat set of files.
 *
 * @param {string} name - Directory name.
 * @param {Record<string, string | object>} entries
 *   If string, treated as file content. If object, treated as a sub-mock directory handle.
 * @returns {FileSystemDirectoryHandle}
 */
const mockDirHandle = (name, entries) => {
  const entryNames = Object.keys(entries).sort();
  return /** @type {any} */ ({
    kind: 'directory',
    name,
    async *keys() {
      for (const key of entryNames) {
        yield key;
      }
    },
    getDirectoryHandle: async (/** @type {string} */ key) => {
      const value = entries[key];
      if (
        typeof value === 'object' &&
        /** @type {any} */ (value).kind === 'directory'
      ) {
        return value;
      }
      throw new Error(`Not a directory: ${key}`);
    },
    getFileHandle: async (/** @type {string} */ key) => {
      const value = entries[key];
      if (typeof value === 'string') {
        return mockFileHandle(value);
      }
      throw new Error(`Not a file: ${key}`);
    },
  });
};

test('makeBrowserTree lists root entries', async t => {
  const dir = mockDirHandle('root', {
    'a.txt': 'A',
    'b.txt': 'B',
    sub: mockDirHandle('sub', {}),
  });
  const tree = makeBrowserTree(dir);
  const names = await E(tree).list();
  t.deepEqual(names, ['a.txt', 'b.txt', 'sub']);
});

test('makeBrowserTree has returns true for existing entries', async t => {
  const dir = mockDirHandle('root', { 'a.txt': 'A' });
  const tree = makeBrowserTree(dir);
  t.true(await E(tree).has('a.txt'));
});

test('makeBrowserTree has returns false for missing entries', async t => {
  const dir = mockDirHandle('root', {});
  const tree = makeBrowserTree(dir);
  t.false(await E(tree).has('nope.txt'));
});

test('makeBrowserTree lookup subdirectory returns a tree', async t => {
  const subDir = mockDirHandle('sub', { 'inner.txt': 'inner' });
  const dir = mockDirHandle('root', { sub: subDir });
  const tree = makeBrowserTree(dir);
  const child = await E(tree).lookup('sub');
  const names = await E(child).list();
  t.deepEqual(names, ['inner.txt']);
});

test('makeBrowserTree lookup file blob streams content via iterateBytesReader', async t => {
  const dir = mockDirHandle('root', { 'data.txt': 'ABC' });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('data.txt');

  // Collect all chunks via the new exo-stream wire protocol.
  const chunks = [];
  for await (const chunk of iterateBytesReader(/** @type {any} */ (blob))) {
    chunks.push(chunk);
  }
  const total = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    total.set(chunk, offset);
    offset += chunk.length;
  }
  t.is(new TextDecoder().decode(total), 'ABC');
});

test('makeBrowserTree onFile callback is called for file lookups', async t => {
  const dir = mockDirHandle('root', { 'a.txt': 'A', 'b.txt': 'B' });
  let fileCount = 0;
  const tree = makeBrowserTree(dir, {
    onFile: () => {
      fileCount += 1;
    },
  });

  await E(tree).lookup('a.txt');
  t.is(fileCount, 1);
  await E(tree).lookup('b.txt');
  t.is(fileCount, 2);
});

test('makeBrowserTree onFile is not called for directory lookups', async t => {
  const subDir = mockDirHandle('sub', {});
  const dir = mockDirHandle('root', { sub: subDir });
  let fileCount = 0;
  const tree = makeBrowserTree(dir, {
    onFile: () => {
      fileCount += 1;
    },
  });

  await E(tree).lookup('sub');
  t.is(fileCount, 0);
});

// ============ checkoutToDirectory ============

test('checkoutToDirectory writes files from a remote tree', async t => {
  // Create a mock remote tree (as the daemon would provide).
  // Leaves are PassableBytesReader Exos (the new exo-stream wire shape).
  const mockTree = makeExo('MockTree', MockTreeI, {
    list: async () => ['greeting.txt'],
    /** @param {string} name */
    lookup: async name => {
      t.is(name, 'greeting.txt');
      return bytesReaderFromIterator([new TextEncoder().encode('hello world')]);
    },
  });

  /** @type {Array<{path: string, data: Uint8Array}>} */
  const writtenFiles = [];

  const destHandle = /** @type {any} */ ({
    kind: 'directory',
    getDirectoryHandle: async () => {
      throw new Error('Not found');
    },
    getFileHandle: async (
      /** @type {string} */ name,
      /** @type {any} */ _opts,
    ) => ({
      createWritable: async () => {
        /** @type {Uint8Array[]} */
        const chunks = [];
        return {
          write: async (/** @type {Uint8Array} */ data) => {
            chunks.push(data);
          },
          close: async () => {
            const total = new Uint8Array(
              chunks.reduce((sum, c) => sum + c.length, 0),
            );
            let offset = 0;
            for (const chunk of chunks) {
              total.set(chunk, offset);
              offset += chunk.length;
            }
            writtenFiles.push({ path: name, data: total });
          },
        };
      },
    }),
  });

  let fileCount = 0;
  await checkoutToDirectory(mockTree, destHandle, {
    onFile: () => {
      fileCount += 1;
    },
  });

  t.is(fileCount, 1);
  t.is(writtenFiles.length, 1);
  t.is(writtenFiles[0].path, 'greeting.txt');

  const decoder = new TextDecoder();
  t.is(decoder.decode(writtenFiles[0].data), 'hello world');
});

test('checkoutToDirectory creates subdirectories for tree nodes', async t => {
  const mockSubTree = makeExo('MockSubTree', MockTreeI, {
    list: async () => ['inner.txt'],
    /** @param {string} _name */
    lookup: async _name =>
      bytesReaderFromIterator([new TextEncoder().encode('inner')]),
  });

  const mockTree = makeExo('MockTree', MockTreeI, {
    list: async () => ['subdir'],
    /** @param {string} _name */
    lookup: async _name => mockSubTree,
  });

  /** @type {string[]} */
  const createdDirs = [];
  /** @type {string[]} */
  const writtenFileNames = [];

  /**
   * @param {string} dirName
   * @returns {any}
   */
  const makeMockDestDir = dirName => ({
    kind: 'directory',
    getDirectoryHandle: async (
      /** @type {string} */ name,
      /** @type {any} */ _opts,
    ) => {
      createdDirs.push(`${dirName}/${name}`);
      return makeMockDestDir(`${dirName}/${name}`);
    },
    getFileHandle: async (
      /** @type {string} */ name,
      /** @type {any} */ _opts,
    ) => {
      writtenFileNames.push(`${dirName}/${name}`);
      return {
        createWritable: async () => ({
          write: async () => {},
          close: async () => {},
        }),
      };
    },
  });

  await checkoutToDirectory(mockTree, makeMockDestDir('root'));

  t.true(createdDirs.includes('root/subdir'));
  t.true(writtenFileNames.includes('root/subdir/inner.txt'));
});

test('checkoutToDirectory onFile callback fires for each file', async t => {
  const mockTree = makeExo('MockTree', MockTreeI, {
    list: async () => ['a.txt', 'b.txt'],
    /** @param {string} _name */
    lookup: async _name => bytesReaderFromIterator([new Uint8Array(0)]),
  });

  const destHandle = /** @type {any} */ ({
    kind: 'directory',
    getDirectoryHandle: async () => {
      throw new Error('Not found');
    },
    getFileHandle: async () => ({
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    }),
  });

  let fileCount = 0;
  await checkoutToDirectory(mockTree, destHandle, {
    onFile: () => {
      fileCount += 1;
    },
  });

  t.is(fileCount, 2);
});

test('checkoutToDirectory handles empty tree', async t => {
  const mockTree = makeExo('MockTree', MockTreeI, {
    list: async () => [],
    lookup: async () => {
      throw new Error('no children');
    },
  });

  const destHandle = /** @type {any} */ ({
    kind: 'directory',
  });

  let fileCount = 0;
  await checkoutToDirectory(mockTree, destHandle, {
    onFile: () => {
      fileCount += 1;
    },
  });

  t.is(fileCount, 0);
});
