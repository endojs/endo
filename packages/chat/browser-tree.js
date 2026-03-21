// @ts-check
/* global showDirectoryPicker */

import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';
import harden from '@endo/harden';
import { M } from '@endo/patterns';

/**
 * @import { FarRef } from '@endo/eventual-send'
 */

// Interface guards for browser-side Exos, matching the daemon's
// ReadableBlob / ReadableTree / AsyncIterator protocols.

const BrowserBlobInterface = M.interface('ReadableBlob', {
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});
harden(BrowserBlobInterface);

const BrowserTreeInterface = M.interface('ReadableTree', {
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});
harden(BrowserTreeInterface);

const BrowserAsyncIteratorInterface = M.interface('AsyncIterator', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(M.any()).returns(M.promise()),
  throw: M.call().optional(M.any()).returns(M.promise()),
});
harden(BrowserAsyncIteratorInterface);

/**
 * Encode a Uint8Array to a base64 string using the browser's built-in APIs.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Decode a base64 string to a Uint8Array using the browser's built-in APIs.
 *
 * @param {string} base64
 * @returns {Uint8Array}
 */
const fromBase64 = base64 => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Wrap a browser FileSystemFileHandle as an Exo ReadableBlob.
 * The daemon calls `streamBase64()` over CapTP to read file content.
 *
 * @param {FileSystemFileHandle} fileHandle
 * @returns {FarRef<unknown>}
 */
const makeBrowserBlob = fileHandle =>
  makeExo('ReadableBlob', BrowserBlobInterface, {
    streamBase64() {
      /** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
      let reader;
      const getReader = async () => {
        if (!reader) {
          const file = await fileHandle.getFile();
          reader = file.stream().getReader();
        }
        return reader;
      };
      return makeExo('AsyncIterator', BrowserAsyncIteratorInterface, {
        async next() {
          const r = await getReader();
          const { value, done } = await r.read();
          if (done) {
            return harden({ value: undefined, done: true });
          }
          return harden({ value: toBase64(value), done: false });
        },
        async return() {
          if (reader) reader.releaseLock();
          return harden({ value: undefined, done: true });
        },
        async throw() {
          if (reader) reader.releaseLock();
          return harden({ value: undefined, done: true });
        },
      });
    },
    async text() {
      const file = await fileHandle.getFile();
      return file.text();
    },
    async json() {
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    },
  });

/**
 * Wrap a browser FileSystemDirectoryHandle as an Exo ReadableTree.
 * Implements the ReadableTree interface that `storeTree` expects:
 * `has(...names)`, `list(...names)`, `lookup(nameOrPath)`.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {{ onFile?: () => void }} [options]
 * @returns {FarRef<unknown>}
 */
export const makeBrowserTree = (dirHandle, options = {}) => {
  const { onFile } = options;

  /**
   * Navigate to a subdirectory by path segments.
   *
   * @param {string[]} names
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const navigateDir = async names => {
    let current = dirHandle;
    for (const name of names) {
      current = await current.getDirectoryHandle(name);
    }
    return current;
  };

  return makeExo('ReadableTree', BrowserTreeInterface, {
    /**
     * @param  {string[]} names
     * @returns {Promise<boolean>}
     */
    async has(...names) {
      try {
        let current = dirHandle;
        for (let i = 0; i < names.length; i += 1) {
          const name = names[i];
          if (i < names.length - 1) {
            current = await current.getDirectoryHandle(name);
          } else {
            // Last segment: could be file or directory.
            try {
              await current.getDirectoryHandle(name);
            } catch {
              await current.getFileHandle(name);
            }
          }
        }
        return true;
      } catch {
        return false;
      }
    },

    /**
     * @param  {string[]} names
     * @returns {Promise<string[]>}
     */
    async list(...names) {
      const dir = await navigateDir(names);
      /** @type {string[]} */
      const entries = [];
      // @ts-ignore FileSystemDirectoryHandle is async iterable in browsers
      for await (const key of dir.keys()) {
        entries.push(key);
      }
      return harden(entries.sort());
    },

    /**
     * @param {string | string[]} nameOrPath
     * @returns {Promise<FarRef<unknown>>}
     */
    async lookup(nameOrPath) {
      const names = Array.isArray(nameOrPath) ? nameOrPath : [nameOrPath];
      let current = dirHandle;
      for (let i = 0; i < names.length - 1; i += 1) {
        current = await current.getDirectoryHandle(names[i]);
      }
      const lastName = names[names.length - 1];
      try {
        const childDir = await current.getDirectoryHandle(lastName);
        return makeBrowserTree(childDir, options);
      } catch {
        const childFile = await current.getFileHandle(lastName);
        if (onFile) onFile();
        return makeBrowserBlob(childFile);
      }
    },
  });
};
harden(makeBrowserTree);

/**
 * Walk a remote ReadableTree and write it to a browser
 * FileSystemDirectoryHandle using the File System Access API.
 *
 * @param {unknown} tree - Remote ReadableTree ref from the daemon.
 * @param {FileSystemDirectoryHandle} rootHandle - Target directory.
 * @param {{ onFile?: () => void }} [options]
 */
export const checkoutToDirectory = async (tree, rootHandle, options = {}) => {
  const { onFile } = options;

  /**
   * @param {unknown} node
   * @param {FileSystemDirectoryHandle} parentHandle
   */
  const walk = async (node, parentHandle) => {
    const names = await E(node).list();
    for (const name of names) {
      const child = await E(node).lookup(name);
      // Use __getMethodNames__ to detect the node type without calling
      // a method that may not exist (which causes CapTP error logging).
      const methods = await E(child).__getMethodNames__();
      const isTree = methods.includes('list');
      if (isTree) {
        const childDir = await parentHandle.getDirectoryHandle(name, {
          create: true,
        });
        await walk(child, childDir);
      } else {
        // It's a readable-blob. Stream its base64 content.
        const iteratorRef = E(child).streamBase64();
        const fileHandle = await parentHandle.getFileHandle(name, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        try {
          let result = await E(iteratorRef).next();
          while (!result.done) {
            const bytes = fromBase64(/** @type {string} */ (result.value));
            await writable.write(bytes);
            result = await E(iteratorRef).next();
          }
        } finally {
          await writable.close();
        }
        if (onFile) onFile();
      }
    }
  };

  await walk(tree, rootHandle);
};
harden(checkoutToDirectory);
