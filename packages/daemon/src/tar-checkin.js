// @ts-check
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';
import { q } from '@endo/errors';
import { readTarEntries, tarPathSegments } from '@endo/tar/reader.js';
import { bytesFromText } from '@endo/bytes/from-string.js';
import { makeRefReader } from './ref-reader.js';

/**
 * The slice of a content store `checkinTarTree` actually exercises: it only
 * stores blobs. A full `SnapshotStore` (the production caller's argument)
 * satisfies this structurally; typing the parameter this narrowly lets test
 * doubles supply just `store` without standing up `fetch`/`has`/`remove`.
 *
 * @typedef {{
 *   store: (
 *     readable: AsyncIterator<Uint8Array> | AsyncIterable<Uint8Array>,
 *   ) => Promise<string>,
 * }} TarCheckinContentStore
 */

/** @typedef {{ type: 'blob', sha256: string }} TarBlobNode */
/** @typedef {{ type: 'tree', entries: Map<string, TarNode> }} TarTreeNode */
/** @typedef {TarBlobNode | TarTreeNode} TarNode */
/**
 * @typedef {object} ArchiveTreeMethods
 * @property {() => Promise<string[]>} __getMethodNames__
 * @property {() => Promise<import('@endo/far').ERef<AsyncIterator<string>>>} archiveTar
 * @property {() => Promise<boolean>} archiveLossless
 */

/**
 * Store a git archive tar stream into the daemon content store's tree JSON
 * format. This accepts only the regular files, directories, and symlinks that
 * native `git archive --format=tar` emits. The tar format parsing lives in
 * `@endo/tar`; the daemon supplies the CapTP base64 ref decoding
 * (`makeRefReader`), the content-store wiring, and the tree assembly.
 *
 * @param {import('@endo/far').ERef<AsyncIterator<string>>} readerRef
 * @param {TarCheckinContentStore} contentStore
 * @returns {Promise<string>} The sha256 of the stored root tree JSON blob.
 */
export const checkinTarTree = async (readerRef, contentStore) => {
  /** @type {TarTreeNode} */
  const root = { type: 'tree', entries: new Map() };
  const seenPaths = new Set();

  /**
   * @param {Uint8Array} bytes
   */
  const storeBytes = async bytes => {
    async function* singleChunk() {
      yield bytes;
    }
    return contentStore.store(singleChunk());
  };

  // A directory or symlink entry carries no stored data, but its content
  // generator must still be drained so the reader consumes the block
  // padding and stays aligned for the next header.
  /**
   * @param {AsyncIterable<Uint8Array>} content
   */
  const drain = async content => {
    const iterator = content[Symbol.asyncIterator]();
    let next = await iterator.next();
    while (!next.done) {
      // eslint-disable-next-line no-await-in-loop
      next = await iterator.next();
    }
  };

  /**
   * @param {string[]} segments
   */
  const ensureDirectory = segments => {
    let dir = root;
    for (const segment of segments) {
      const existing = dir.entries.get(segment);
      if (existing === undefined) {
        /** @type {TarTreeNode} */
        const child = { type: 'tree', entries: new Map() };
        dir.entries.set(segment, child);
        dir = child;
      } else if (existing.type === 'tree') {
        dir = existing;
      } else {
        throw new Error(`Tar entry path conflicts with blob ${q(segment)}`);
      }
    }
    return dir;
  };

  /**
   * Attach a blob node (by its stored sha256) at `segments`.
   *
   * @param {string[]} segments
   * @param {string} sha256
   */
  const attachBlob = (segments, sha256) => {
    const name = segments[segments.length - 1];
    const parent = ensureDirectory(segments.slice(0, -1));
    if (parent.entries.has(name)) {
      throw new Error(`Duplicate tar entry path ${q(segments.join('/'))}`);
    }
    parent.entries.set(name, { type: 'blob', sha256 });
  };

  for await (const entry of readTarEntries(makeRefReader(readerRef))) {
    const segments = tarPathSegments(entry.path);
    const normalizedPath = segments.join('/');
    if (seenPaths.has(normalizedPath)) {
      throw new Error(`Duplicate tar entry path ${q(normalizedPath)}`);
    }
    seenPaths.add(normalizedPath);

    if (entry.type === 'directory') {
      await drain(entry.content);
      ensureDirectory(segments);
    } else if (entry.type === 'file') {
      // Stream the entry's content straight into the content store; the
      // reader yields it chunk-by-chunk and consumes the block padding,
      // so the whole archive is never materialized.
      const sha256 = await contentStore.store(entry.content);
      attachBlob(segments, sha256);
    } else {
      // Symlink: the target is the header linkname and the content size
      // is zero, but drain any content/padding to stay block-aligned.
      await drain(entry.content);
      attachBlob(segments, await storeBytes(bytesFromText(entry.linkname)));
    }
  }

  /**
   * @param {TarTreeNode} tree
   * @returns {Promise<string>}
   */
  const storeTree = async tree => {
    /** @type {Array<[string, string, string]>} */
    const entries = [];
    for (const [name, child] of tree.entries) {
      if (child.type === 'tree') {
        entries.push([name, 'tree', await storeTree(child)]);
      } else {
        entries.push([name, 'blob', child.sha256]);
      }
    }
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return storeBytes(bytesFromText(JSON.stringify(entries)));
  };

  return storeTree(root);
};
harden(checkinTarTree);
