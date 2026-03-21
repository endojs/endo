// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';

import { makeRefReader } from './ref-reader.js';

/** @import { TreeWriter } from './types.js' */

/**
 * Recursively walk a ReadableTree (local or remote) and materialize
 * it through a TreeWriter.
 *
 * @param {unknown} tree
 * @param {TreeWriter} writer
 * @param {{ onFile?: () => void }} [options]
 */
export const checkoutTree = async (tree, writer, options = {}) => {
  const { onFile } = options;

  /**
   * @param {unknown} node
   * @param {string[]} pathSegments
   */
  const walk = async (node, pathSegments) => {
    await writer.makeDirectory(pathSegments);
    const names = await E(node).list();
    for (const name of names) {
      const child = await E(node).lookup(name);
      const childPath = [...pathSegments, name];
      // Duck-type: try list() to distinguish tree from blob.
      let isTree = false;
      try {
        await E(child).list();
        isTree = true;
      } catch (_e) {
        isTree = false;
      }
      if (isTree) {
        await walk(child, childPath);
      } else {
        // It's a readable-blob. Stream its content through the writer.
        const readerRef = E(child).streamBase64();
        const readable = makeRefReader(readerRef);
        await writer.writeBlob(childPath, readable);
        if (onFile) onFile();
      }
    }
  };

  await walk(tree, []);
};
harden(checkoutTree);
