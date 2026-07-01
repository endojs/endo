// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { InventoryList } from '@endo/space-chat';

import { h, renderConfined } from './setup-preact-container.js';

// The currently-installed inventory-toggle listeners' detacher. Only one root
// inventory is mounted at a time (nested levels recurse inside the confined
// tree, not through this wrapper), so a single module-level slot suffices.
// Re-mounting (a channel switch) detaches the prior listeners before installing
// fresh ones bound to the new powers. Covers both the show-special and the
// group-by-type toggles.
/** @type {(() => void) | undefined} */
let detachToggleListeners;

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

  // Two host toggle icon buttons govern the top-level inventory view. The
  // confined tree must not reach for that host DOM itself, so this trusted
  // wrapper reads each button's live `aria-pressed` state and re-renders on
  // change, passing plain props in:
  //   - show-special: whether `@`-prefixed system names are revealed.
  //   - group-by-type: whether the grouped view (the default) or the prior flat
  //     view is rendered.
  // Reading `aria-pressed` (set by the button's click handler before the
  // dispatched `change` event fires) is order-independent of the sibling
  // listener that toggles the `.show-special` class on the list.
  const $specialToggle = /** @type {HTMLElement | null} */ (
    document.getElementById('show-special-toggle')
  );
  const $groupToggle = /** @type {HTMLElement | null} */ (
    document.getElementById('group-by-type-toggle')
  );

  const renderTree = () => {
    const showSpecial = $specialToggle
      ? $specialToggle.getAttribute('aria-pressed') === 'true'
      : $list.classList.contains('show-special');
    // Grouping is the default view; absent the toggle the grouped layout holds.
    const grouped = $groupToggle
      ? $groupToggle.getAttribute('aria-pressed') === 'true'
      : true;
    renderConfined(
      h(InventoryList, {
        powers,
        options: harden({ ...confinedOptions, showSpecial }),
        path,
        rootPowers,
        rootPrefix,
        grouped,
      }),
      $list,
    );
  };

  renderTree();

  // Re-render the (state-preserving) confined tree when either toggle flips, so
  // the per-group counts track the special-name filter and the layout tracks
  // the grouping choice. renderConfined reconciles the existing tree in place,
  // so the followNameChanges subscription and accumulated names survive the
  // re-render.
  if ($specialToggle || $groupToggle) {
    if (detachToggleListeners) {
      detachToggleListeners();
    }
    const detachers = [];
    for (const $toggle of [$specialToggle, $groupToggle]) {
      if ($toggle) {
        $toggle.addEventListener('change', renderTree);
        detachers.push(() => $toggle.removeEventListener('change', renderTree));
      }
    }
    detachToggleListeners = () => {
      for (const detach of detachers) {
        detach();
      }
    };
  }
};
harden(inventoryComponent);
