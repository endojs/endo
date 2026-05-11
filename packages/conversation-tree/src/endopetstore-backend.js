// @ts-check
/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import harden from '@endo/harden';

/** @import { ConversationNode, TreeBackend } from '../types.js' */

const CT_PREFIX = 'ct-';

/**
 * Backend that persists conversation nodes in the Endo daemon's petname
 * store via `E(powers).storeValue` / `E(powers).lookup`.
 *
 * Nodes are stored under petnames `ct-<nodeId>`.
 *
 * @param {object} powers - Endo guest/host powers with storeValue / lookup / list
 * @returns {TreeBackend}
 */
export const makeEndoPetstoreBackend = powers => {
  /** @type {TreeBackend} */
  const backend = {
    async putNode(node) {
      const petName = `${CT_PREFIX}${node.id}`;
      await E(powers).storeValue(harden(node), [petName]);
    },

    async getNode(id) {
      const petName = `${CT_PREFIX}${id}`;
      try {
        const node = /** @type {ConversationNode} */ (
          await E(powers).lookup(petName)
        );
        return node;
      } catch {
        return null;
      }
    },

    async getChildren(parentId) {
      const allNames = /** @type {string[]} */ (await E(powers).list());
      /** @type {ConversationNode[]} */
      const children = [];
      for (const name of allNames) {
        if (name.startsWith(CT_PREFIX)) {
          try {
            const node = /** @type {ConversationNode} */ (
              await E(powers).lookup(name)
            );
            if (node.parentId === parentId) {
              children.push(node);
            }
          } catch {
            // skip unreadable entries
          }
        }
      }
      return children;
    },

    async getRoots() {
      return backend.getChildren(null);
    },
  };

  return harden(backend);
};
harden(makeEndoPetstoreBackend);
