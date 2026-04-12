// @ts-check
/* eslint-disable no-await-in-loop */

import '@endo/init/debug.js';

import test from 'ava';
import { Far, E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeBrowserTree, checkoutToDirectory } from '../../browser-tree.js';

const MockTreeI = M.interface('MockTree', {
  list: M.call().returns(M.any()),
  lookup: M.call(M.string()).returns(M.any()),
});

const MockBlobI = M.interface('MockBlob', {
  streamBase64: M.call().returns(M.any()),
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
    /** @param {string} entryName */
    getFileHandle: async entryName => {
      const value = entries[entryName];
      if (typeof value !== 'string') {
        throw new DOMException('Not a file', 'TypeMismatchError');
      }
      return mockFileHandle(value);
    },
    /** @param {string} entryName */
    getDirectoryHandle: async entryName => {
      const value = entries[entryName];
      if (typeof value !== 'object' || value === null) {
        throw new DOMException('Not a directory', 'TypeMismatchError');
      }
      return value;
    },
  });
};

// ============ makeBrowserTree — list ============

test('makeBrowserTree list returns sorted file names', async t => {
  const dir = mockDirHandle('root', { 'b.txt': 'B', 'a.txt': 'A' });
  const tree = makeBrowserTree(dir);
  const names = await E(tree).list();
  t.deepEqual(names, ['a.txt', 'b.txt']);
});

test('makeBrowserTree list of empty directory returns empty array', async t => {
  const dir = mockDirHandle('empty', {});
  const tree = makeBrowserTree(dir);
  const names = await E(tree).list();
  t.deepEqual(names, []);
});

// ============ makeBrowserTree — has ============

test('makeBrowserTree has returns true for existing file', async t => {
  const dir = mockDirHandle('root', { 'readme.md': 'hello' });
  const tree = makeBrowserTree(dir);
  t.true(await E(tree).has('readme.md'));
});

test('makeBrowserTree has returns false for missing file', async t => {
  const dir = mockDirHandle('root', { 'readme.md': 'hello' });
  const tree = makeBrowserTree(dir);
  t.false(await E(tree).has('missing.txt'));
});

test('makeBrowserTree has returns true for existing subdirectory', async t => {
  const subDir = mockDirHandle('sub', { 'x.txt': 'X' });
  const dir = mockDirHandle('root', { sub: subDir });
  const tree = makeBrowserTree(dir);
  t.true(await E(tree).has('sub'));
});

// ============ makeBrowserTree — lookup ============

test('makeBrowserTree lookup file returns a blob with text()', async t => {
  const dir = mockDirHandle('root', { 'hello.txt': 'world' });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('hello.txt');
  const text = await E(blob).text();
  t.is(text, 'world');
});

test('makeBrowserTree lookup file returns a blob with json()', async t => {
  const dir = mockDirHandle('root', {
    'data.json': JSON.stringify({ key: 'value' }),
  });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('data.json');
  const data = await E(blob).json();
  t.deepEqual(data, { key: 'value' });
});

test('makeBrowserTree lookup subdirectory returns a tree', async t => {
  const subDir = mockDirHandle('sub', { 'inner.txt': 'inner' });
  const dir = mockDirHandle('root', { sub: subDir });
  const tree = makeBrowserTree(dir);
  const child = await E(tree).lookup('sub');
  const names = await E(child).list();
  t.deepEqual(names, ['inner.txt']);
});

test('makeBrowserTree lookup file blob streamBase64 yields content', async t => {
  const dir = mockDirHandle('root', { 'data.txt': 'ABC' });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('data.txt');
  const iteratorRef = E(blob).streamBase64();

  // Collect all chunks
  const chunks = [];
  let result = await E(iteratorRef).next();
  while (!result.done) {
    chunks.push(result.value);
    result = await E(iteratorRef).next();
  }

  // Decode and verify
  const decoded = atob(chunks.join(''));
  t.is(decoded, 'ABC');
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

// ============ makeBrowserTree — streamBase64 iterator protocol ============

test('makeBrowserTree blob streamBase64 return() terminates iterator', async t => {
  const dir = mockDirHandle('root', { 'data.txt': 'hello' });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('data.txt');
  const iteratorRef = E(blob).streamBase64();

  const returnResult = await E(iteratorRef).return();
  t.true(returnResult.done);
});

test('makeBrowserTree blob streamBase64 throw() terminates iterator', async t => {
  const dir = mockDirHandle('root', { 'data.txt': 'hello' });
  const tree = makeBrowserTree(dir);
  const blob = await E(tree).lookup('data.txt');
  const iteratorRef = E(blob).streamBase64();

  const throwResult = await E(iteratorRef).throw();
  t.true(throwResult.done);
});

// ============ checkoutToDirectory ============

test('checkoutToDirectory writes files from a remote tree', async t => {
  // Create a mock remote tree (as the daemon would provide)
  const mockTree = makeExo('MockTree', MockTreeI, {
    list: async () => ['greeting.txt'],
    /** @param {string} name */
    lookup: async name => {
      t.is(name, 'greeting.txt');
      return makeExo('MockBlob', MockBlobI, {
        streamBase64: () => {
          let called = false;
          return Far('MockIterator', {
            async next() {
              if (!called) {
                called = true;
                return { value: btoa('hello world'), done: false };
              }
              return { value: undefined, done: true };
            },
            async return() {
              return { value: undefined, done: true };
            },
            async throw() {
              return { value: undefined, done: true };
            },
          });
        },
      });
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
      makeExo('MockBlob', MockBlobI, {
        streamBase64: () => {
          let called = false;
          return Far('MockIterator', {
            async next() {
              if (!called) {
                called = true;
                return { value: btoa('inner'), done: false };
              }
              return { value: undefined, done: true };
            },
            async return() {
              return { value: undefined, done: true };
            },
            async throw() {
              return { value: undefined, done: true };
            },
          });
        },
      }),
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
    lookup: async _name =>
      makeExo('MockBlob', MockBlobI, {
        streamBase64: () =>
          Far('MockIterator', {
            async next() {
              return { value: undefined, done: true };
            },
            async return() {
              return { value: undefined, done: true };
            },
            async throw() {
              return { value: undefined, done: true };
            },
          }),
      }),
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
