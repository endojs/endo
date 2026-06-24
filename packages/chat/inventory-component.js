// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { InventoryOptions } from '@endo/space-chat/src/inventory/inventory.js' */

import harden from '@endo/harden';
import { InventoryList } from '@endo/space-chat';

import { h, renderConfined } from './setup-preact-container.js';

// Host wrapper for the default 1:1 chat (inbox) space's inventory pet-name
// tree. The view itself — the confined `InventoryList` Preact tree and all its
// nested item rendering and drag-and-drop handlers — lives in the standalone
// `@endo/space-chat` package. This trusted host code resolves the mount node
// (the `.pet-list` element) and applies the project's CONFINED renderer.

/**
 * Mount the inventory tree into the `.pet-list` inside `$parent` (or `$parent`
 * itself). A single `renderConfined(h(InventoryList, …))` owns the whole tree;
 * recursion is a nested `<InventoryList>` inside an expanded item, not a
 * recursive imperative call. Returns a Promise that resolves once mounted, so
 * existing callers may keep doing `inventoryComponent(...).catch(fn)`.
 *
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} _end - Reserved (was an imperative end marker).
 * @param {ERef<EndoHost>} powers
 * @param {InventoryOptions} options
 * @param {string[]} [path] - Current path for nested inventories.
 * @param {ERef<EndoHost>} [rootPowers] - Top-level powers for the whole tree,
 *   against which drag-and-drop link/move operate. Defaults to `powers`.
 * @param {string[]} [rootPrefix] - Absolute pet-name path from `rootPowers` to
 *   this level.
 * @returns {Promise<void>}
 */
export const inventoryComponent = async (
  $parent,
  _end,
  powers,
  options,
  path = [],
  rootPowers = powers,
  rootPrefix = [],
) => {
  const $list = /** @type {HTMLElement} */ (
    $parent.querySelector('.pet-list') || $parent
  );

  renderConfined(
    h(InventoryList, { powers, options, path, rootPowers, rootPrefix }),
    $list,
  );
};
harden(inventoryComponent);
