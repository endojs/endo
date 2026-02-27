// @ts-check
/* global window, document */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';

/**
 * @typedef {object} InventoryOptions
 * @property {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} showValue
 * @property {((petName: string, formulaId: string) => void)} [onSelectConversation]
 * @property {string | null} [activeConversationPetName]
 */

/**
 * Formula types that can be selected as chat conversations.
 * Only handles (identities) and remote/peer references (which resolve to
 * handles on the other side) are valid conversation targets.
 * Excludes 'host' and 'guest' which are powers/profile objects, not contacts.
 */
const CONVERSABLE_TYPES = harden(['handle', 'peer', 'remote']);

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} _end
 * @param {ERef<EndoHost>} powers
 * @param {InventoryOptions} options
 * @param {string[]} [path] - Current path for nested inventories
 */
export const inventoryComponent = async (
  $parent,
  _end,
  powers,
  { showValue, onSelectConversation, activeConversationPetName },
  path = [],
) => {
  const $list = $parent.querySelector('.pet-list') || $parent;

  /** @type {Map<string, { $wrapper: HTMLElement, cleanup?: () => void }>} */
  const $names = new Map();

  /**
   * Check if a name is "special" (all uppercase letters/numbers/hyphens).
   * @param {string} name
   * @returns {boolean}
   */
  const isSpecialName = name => /^[A-Z][A-Z0-9_-]*$/.test(name);

  /**
   * Create an inventory item with disclosure triangle.
   * @param {string} name
   */
  const createItem = name => {
    const itemPath = [...path, name];

    const $wrapper = document.createElement('div');
    $wrapper.className = 'pet-item-wrapper';
    if (isSpecialName(name)) {
      $wrapper.classList.add('special');
    }

    const $row = document.createElement('div');
    $row.className = 'pet-item-row';

    // Disclosure triangle
    const $disclosure = document.createElement('button');
    $disclosure.className = 'pet-disclosure';
    $disclosure.textContent = '▶';
    $disclosure.title = 'Expand';
    $row.appendChild($disclosure);

    const $name = document.createElement('span');
    $name.className = 'pet-name';
    $name.textContent = name;
    $name.title = 'Click to view';
    $row.appendChild($name);

    const $buttons = document.createElement('span');
    $buttons.className = 'pet-buttons';

    const $info = document.createElement('button');
    $info.className = 'info-button';
    $info.textContent = 'ℹ';
    $info.title = 'Inspect';
    $buttons.appendChild($info);

    // Remove button (disabled for special names)
    const $remove = document.createElement('button');
    $remove.className = 'remove-button';
    $remove.textContent = '×';
    if (isSpecialName(name)) {
      $remove.disabled = true;
      $remove.title = 'Cannot remove system name';
    } else {
      $remove.title = 'Remove';
    }
    $buttons.appendChild($remove);

    $row.appendChild($buttons);
    $wrapper.appendChild($row);

    // Children container (initially hidden)
    const $children = document.createElement('div');
    $children.className = 'pet-children';
    $wrapper.appendChild($children);

    $list.appendChild($wrapper);

    const inspectItem = () => {
      const idP = E(powers).identify(
        .../** @type {[string, ...string[]]} */ (itemPath),
      );
      const valueP = E(powers).lookup(itemPath);
      Promise.all([idP, valueP]).then(
        ([id, value]) => showValue(value, id, itemPath, undefined),
        window.reportError,
      );
    };

    $info.onclick = inspectItem;
    $remove.onclick = () =>
      E(powers)
        .remove(.../** @type {[string, ...string[]]} */ (itemPath))
        .catch(window.reportError);

    // Probe the formula type to detect conversable items
    if (onSelectConversation) {
      E(powers)
        .locate(.../** @type {[string, ...string[]]} */ (itemPath))
        .then(locator => {
          if (!locator) return;
          const url = new URL(/** @type {string} */ (locator));
          const type = url.searchParams.get('type');
          if (type && CONVERSABLE_TYPES.includes(type)) {
            $wrapper.classList.add('conversable');
            $name.title = 'Open conversation';
            const formulaNumber = url.searchParams.get('id');
            const nodeNumber = url.hostname;
            const formulaId = `${formulaNumber}:${nodeNumber}`;
            $name.onclick = () => {
              onSelectConversation(name, formulaId);
            };
            if (
              activeConversationPetName &&
              path.length === 0 &&
              name === activeConversationPetName
            ) {
              $wrapper.classList.add('active-conversation');
            }
          }
        })
        .catch(() => {
          // Item may have been removed
        });
    }

    // Track expansion state and cleanup
    let isExpanded = false;
    /** @type {(() => void) | undefined} */
    let childCleanup;

    // Disclosure triangle click handler
    $disclosure.onclick = async () => {
      if (isExpanded) {
        // Collapse
        isExpanded = false;
        $disclosure.classList.remove('expanded');
        $disclosure.title = 'Expand';
        $children.classList.remove('expanded');
        // Clean up child subscriptions
        if (childCleanup) {
          childCleanup();
          childCleanup = undefined;
        }
        $children.innerHTML = '';
      } else {
        // Expand - try to load children
        $disclosure.classList.add('loading');
        try {
          const target = await E(powers).lookup(itemPath);
          // Check if it has followNameChanges (is a name hub)
          // We probe by trying to get the async iterator
          const changesIterator = E(
            /** @type {import('@endo/far').ERef<EndoHost>} */ (target),
          ).followNameChanges();
          // If we get here without error, it's expandable
          isExpanded = true;
          $disclosure.classList.remove('loading');
          $disclosure.classList.add('expanded');
          $disclosure.title = 'Collapse';
          $children.classList.add('expanded');

          // Start nested inventory watching the nested target
          // Pass empty path since target is now the root for this subtree
          // But we need to wrap operations to use the full path from root powers
          const nestedPowers = /** @type {ERef<EndoHost>} */ (
            /** @type {unknown} */ ({
              /** @param {string | string[]} subPathOrName */
              lookup: subPathOrName => {
                const subPath =
                  typeof subPathOrName === 'string'
                    ? [subPathOrName]
                    : subPathOrName;
                return E(powers).lookup([...itemPath, ...subPath]);
              },
              /** @param {string[]} subPath */
              remove: (...subPath) => {
                const fullPath = [...itemPath, ...subPath];
                return E(powers).remove(
                  .../** @type {[string, ...string[]]} */ (fullPath),
                );
              },
              /** @param {string[]} subPath */
              identify: (...subPath) => {
                const fullPath = [...itemPath, ...subPath];
                return E(powers).identify(
                  .../** @type {[string, ...string[]]} */ (fullPath),
                );
              },
              /** @param {string[]} subPath */
              locate: (...subPath) => {
                const fullPath = [...itemPath, ...subPath];
                return E(powers).locate(
                  .../** @type {[string, ...string[]]} */ (fullPath),
                );
              },
              followNameChanges: () => changesIterator,
            })
          );

          inventoryComponent(
            $children,
            null,
            nestedPowers,
            { showValue, onSelectConversation, activeConversationPetName },
            [], // Reset path since nestedPowers handles the prefix
          ).catch(() => {
            // Silently handle errors (e.g., if the item is removed)
          });
        } catch {
          // Not expandable (no followNameChanges method or error)
          $disclosure.classList.remove('loading');
          $disclosure.classList.add('hidden');
        }
      }
    };

    return { $wrapper, cleanup: () => childCleanup?.() };
  };

  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;
      const item = createItem(name);
      $names.set(name, item);
    } else if ('remove' in change) {
      const item = $names.get(change.remove);
      if (item !== undefined) {
        item.cleanup?.();
        item.$wrapper.remove();
        $names.delete(change.remove);
      }
    }
  }
};
