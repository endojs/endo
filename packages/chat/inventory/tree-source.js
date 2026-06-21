// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/far';

// Substrate-agnostic data layer for the inventory bar: the formula-type
// classification rules and the adapter that lets a static `ReadableTree`
// snapshot drive the same component that normally consumes a live
// `followNameChanges()` stream. Extracted from inventory-component.js
// (Phase 1 of the Preact migration — see designs/preact-confinement-migration.md);
// this survives the eventual Preact conversion unchanged.

/**
 * Formula types that can be selected as chat conversations.
 * Only handles (identities) and remote/peer references (which resolve to
 * handles on the other side) are valid conversation targets.
 * Excludes 'host' and 'guest' which are powers/profile objects, not contacts.
 */
export const CONVERSABLE_TYPES = harden(['handle', 'peer', 'remote']);

/**
 * Non-expandable formula types — these items have no children and should not
 * show a disclosure triangle.
 */
export const NON_EXPANDABLE_TYPES = harden([
  'channel',
  'readable-blob',
  'worker',
  'eval',
  'web-bundle',
]);

/**
 * Formula types that are name hubs and can therefore accept a dropped item
 * (link or move it into themselves via storeIdentifier). Other types are
 * leaves; dropping onto them falls through to the containing directory.
 */
export const HUB_TYPES = harden(['directory', 'host', 'guest']);

/**
 * Create a synthetic async iterator that yields `{add: name}` for each name
 * in the array, then hangs until `return()` is called. This allows static
 * name lists (from ReadableTree.list()) to drive the same inventoryComponent
 * that normally consumes a live `followNameChanges()` stream.
 *
 * @param {string[]} names
 * @returns {AsyncIterator<{ add: string }, undefined>}
 */
export const makeStaticNameIterator = names => {
  let index = 0;
  /** @type {((result: IteratorResult<{ add: string }, undefined>) => void) | undefined} */
  let resolveHang;
  return harden({
    async next() {
      if (index < names.length) {
        const name = names[index];
        index += 1;
        return harden({ value: harden({ add: name }), done: false });
      }
      // All names yielded — hang until return() is called on collapse.
      return new Promise(resolve => {
        resolveHang = resolve;
      });
    },
    async return() {
      if (resolveHang) resolveHang(harden({ value: undefined, done: true }));
      return harden({ value: undefined, done: true });
    },
    async throw() {
      if (resolveHang) resolveHang(harden({ value: undefined, done: true }));
      return harden({ value: undefined, done: true });
    },
  });
};
harden(makeStaticNameIterator);

/**
 * Wrap a static tree-like object (ReadableTree, etc.) as a powers proxy
 * suitable for `inventoryComponent`. Tree children don't have formula IDs
 * or locators, so `identify` and `locate` return undefined and `remove`
 * is unsupported.
 *
 * @param {unknown} tree - The tree-like object with list() and lookup().
 * @param {string[]} names - The names returned by tree.list().
 * @returns {ERef<EndoHost>}
 */
export const makeStaticTreePowers = (tree, names) => {
  const iterator = makeStaticNameIterator(names);
  return /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ ({
      /** @param {string | string[]} subPathOrName */
      lookup: subPathOrName => {
        const subPath =
          typeof subPathOrName === 'string' ? [subPathOrName] : subPathOrName;
        // Chain through the tree's own lookup
        return subPath.reduce(
          (node, segment) =>
            E(
              /** @type {ERef<{ lookup: (name: string) => unknown }>} */ (node),
            ).lookup(segment),
          /** @type {unknown} */ (tree),
        );
      },
      remove: () =>
        Promise.reject(new Error('Cannot remove from immutable tree')),
      identify: () => Promise.resolve(undefined),
      locate: () => Promise.resolve(undefined),
      followNameChanges: () => iterator,
    })
  );
};
harden(makeStaticTreePowers);
