// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { InventoryList } from '@endo/space-chat';

import { h, renderConfined } from './setup-preact-container.js';

// Host wrapper for the default 1:1 chat (inbox) space's inventory pet-name
// tree. The view itself — the confined `InventoryList` Preact tree and all its
// nested item rendering and drag-and-drop handlers — lives in the standalone
// `@endo/space-chat` package. This trusted host code resolves the mount node
// (the `.pet-list` element), applies the project's CONFINED renderer, and
// injects the host-only capabilities the confined tree must not hold itself:
// `reportError` (the ambient error sink) and `clearDropHighlights` (a sweep of
// the app's own drag-highlight DOM).

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
 * @param {{ showValue: (value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>, onSelectConversation?: (petName: string | string[], formulaId: string) => void, activeConversationPetName?: string | null }} options
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

  // Augment the caller's options with the host-only capabilities the confined
  // tree relies on but must never reach for ambiently: the platform error sink
  // and a sweep of the app's own lingering drag-highlight classes (the
  // browser's per-element dragleave model can leave an ancestor highlighted).
  const confinedOptions = harden({
    ...options,
    /** @param {unknown} error */
    reportError: error => window.reportError(error),
    clearDropHighlights: () => {
      for (const $el of document.querySelectorAll('.drop-target')) {
        $el.classList.remove('drop-target');
      }
      for (const $el of document.querySelectorAll('.drop-target-list')) {
        $el.classList.remove('drop-target-list');
      }
    },
  });

  renderConfined(
    h(InventoryList, {
      powers,
      options: confinedOptions,
      path,
      rootPowers,
      rootPrefix,
    }),
    $list,
  );
};
harden(inventoryComponent);
