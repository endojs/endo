// @ts-check

import harden from '@endo/harden';

/** @import { ConversationNode, TreeBackend } from '../types.js' */

/**
 * In-memory backend for conversation trees. Suitable for browser-side
 * use and tests — state lives only as long as the page / process.
 *
 * @returns {TreeBackend}
 */
export const makeMemoryBackend = () => {
  /** @type {Map<string, ConversationNode>} */
  const nodes = new Map();

  /** @type {TreeBackend} */
  const backend = {
    async putNode(node) {
      nodes.set(node.id, node);
    },

    async getNode(id) {
      return nodes.get(id) ?? null;
    },

    async getChildren(parentId) {
      /** @type {ConversationNode[]} */
      const children = [];
      for (const node of nodes.values()) {
        if (node.parentId === parentId) {
          children.push(node);
        }
      }
      return children;
    },

    async getRoots() {
      /** @type {ConversationNode[]} */
      const roots = [];
      for (const node of nodes.values()) {
        if (node.parentId === null) {
          roots.push(node);
        }
      }
      return roots;
    },
  };

  return harden(backend);
};
harden(makeMemoryBackend);
