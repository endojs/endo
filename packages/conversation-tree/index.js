// @ts-check
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';

/** @import { ChatMessage, ConversationNode, ConversationTree, TreeBackend } from './types.js' */

export { makeMemoryBackend } from './src/memory-backend.js';
export { makeEndoPetstoreBackend } from './src/endopetstore-backend.js';

let nextSuffix = 0;

/**
 * Generate a simple unique id. In endo-daemon context the caller typically
 * supplies the endo messageId instead.
 *
 * @returns {string}
 */
const generateId = () => {
  nextSuffix += 1;
  return `ct-${Date.now()}-${nextSuffix}`;
};

/**
 * Create a conversation tree backed by the given storage backend.
 *
 * @param {TreeBackend} backend
 * @returns {ConversationTree}
 */
export const makeConversationTree = backend => {
  /** @type {ConversationTree} */
  const tree = {
    async addNode(parentId, messages, metadata = {}) {
      const id =
        typeof metadata.nodeId === 'string' ? metadata.nodeId : generateId();
      /** @type {ConversationNode} */
      const node = harden({
        id,
        parentId,
        messages: harden(messages),
        metadata: harden(metadata),
        timestamp: Date.now(),
      });
      await backend.putNode(node);
      return node;
    },

    async getNode(id) {
      return backend.getNode(id);
    },

    /**
     * Walk from the given leaf up to the root, collecting all messages
     * in order. This produces the full context window for an LLM call.
     *
     * @param {string} leafId
     * @returns {Promise<ChatMessage[]>}
     */
    async getPath(leafId) {
      /** @type {ConversationNode[]} */
      const chain = [];
      /** @type {string | null} */
      let currentId = leafId;
      while (currentId !== null) {
        const node = await backend.getNode(currentId);
        if (node === null) {
          break;
        }
        chain.push(node);
        currentId = node.parentId;
      }
      chain.reverse();
      /** @type {ChatMessage[]} */
      const path = [];
      for (const node of chain) {
        path.push(...node.messages);
      }
      return path;
    },

    async getChildren(parentId) {
      return backend.getChildren(parentId);
    },

    async getRoots() {
      return backend.getRoots();
    },
  };

  return harden(tree);
};
harden(makeConversationTree);
