// @ts-check
/* global window, document */

import { E } from '@endo/far';
import { makeRefIterator } from './ref-iterator.js';

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} _end
 * @param {unknown} powers
 * @param {{ showValue: (value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: number, edgeName: string }) => void | Promise<void> }} options
 * @param {string[]} [path] - Current path for nested inventories
 */
export const inventoryComponent = async (
  $parent,
  _end,
  powers,
  { showValue },
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

    // Event handlers
    $name.onclick = () => {
      const idP = E(powers).identify(...itemPath);
      const valueP = E(powers).lookup(...itemPath);
      Promise.all([idP, valueP]).then(
        ([id, value]) => showValue(value, id, itemPath, undefined),
        window.reportError,
      );
    };
    $remove.onclick = () =>
      E(powers)
        .remove(...itemPath)
        .catch(window.reportError);

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
          const target = await E(powers).lookup(...itemPath);
          // Check if it has followNameChanges (is a name hub)
          // We probe by trying to get the async iterator
          const changesIterator = E(target).followNameChanges();
          // If we get here without error, it's expandable
          isExpanded = true;
          $disclosure.classList.remove('loading');
          $disclosure.classList.add('expanded');
          $disclosure.title = 'Collapse';
          $children.classList.add('expanded');

          // Start nested inventory watching the nested target
          // Pass empty path since target is now the root for this subtree
          // But we need to wrap operations to use the full path from root powers
          const nestedPowers = {
            /** @param {string[]} subPath */
            lookup: (...subPath) => E(powers).lookup(...itemPath, ...subPath),
            /** @param {string[]} subPath */
            remove: (...subPath) => E(powers).remove(...itemPath, ...subPath),
            /** @param {string[]} subPath */
            identify: (...subPath) =>
              E(powers).identify(...itemPath, ...subPath),
            followNameChanges: () => changesIterator,
          };

          inventoryComponent(
            $children,
            null,
            nestedPowers,
            { showValue },
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
