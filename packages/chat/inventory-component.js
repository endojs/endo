// @ts-check
/* global window, document */

import harden from '@endo/harden';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { isSpecialName } from '@endo/daemon/pet-name.js';
import { makeRefIterator } from './ref-iterator.js';

/**
 * @typedef {object} InventoryOptions
 * @property {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} showValue
 * @property {((petName: string, formulaId: string) => void)} [onSelectConversation]
 * @property {string | null} [activeConversationPetName]
 * @property {boolean} [channelMode] - If true, show "Channels" header and channel-specific UI
 * @property {(channelPetName: string) => void} [onSelectChannel] - Called when a channel is selected
 * @property {string | null} [activeChannelPetName] - Currently active channel pet name
 */

/**
 * Formula types that can be selected as chat conversations.
 * Only handles (identities) and remote/peer references (which resolve to
 * handles on the other side) are valid conversation targets.
 * Excludes 'host' and 'guest' which are powers/profile objects, not contacts.
 */
const CONVERSABLE_TYPES = harden(['handle', 'peer', 'remote']);

/**
 * Non-expandable formula types — these items have no children and should not
 * show a disclosure triangle.
 */
const NON_EXPANDABLE_TYPES = harden([
  'channel',
  'readable-blob',
  'worker',
  'eval',
  'web-bundle',
]);

/**
 * Create a synthetic async iterator that yields `{add: name}` for each name
 * in the array, then hangs until `return()` is called. This allows static
 * name lists (from ReadableTree.list()) to drive the same inventoryComponent
 * that normally consumes a live `followNameChanges()` stream.
 *
 * @param {string[]} names
 * @returns {AsyncIterator<{ add: string }, undefined>}
 */
const makeStaticNameIterator = names => {
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
      if (resolveHang)
        resolveHang(harden({ value: undefined, done: true }));
      return harden({ value: undefined, done: true });
    },
    async throw() {
      if (resolveHang)
        resolveHang(harden({ value: undefined, done: true }));
      return harden({ value: undefined, done: true });
    },
  });
};

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
const makeStaticTreePowers = (tree, names) => {
  const iterator = makeStaticNameIterator(names);
  return /** @type {ERef<EndoHost>} */ (
    /** @type {unknown} */ ({
      /** @param {string | string[]} subPathOrName */
      lookup: subPathOrName => {
        const subPath =
          typeof subPathOrName === 'string'
            ? [subPathOrName]
            : subPathOrName;
        // Chain through the tree's own lookup
        return subPath.reduce(
          (node, segment) => E(node).lookup(segment),
          /** @type {unknown} */ (tree),
        );
      },
      remove: () => Promise.reject(new Error('Cannot remove from immutable tree')),
      identify: () => Promise.resolve(undefined),
      locate: () => Promise.resolve(undefined),
      followNameChanges: () => iterator,
    })
  );
};

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
  {
    showValue,
    onSelectConversation,
    activeConversationPetName,
    channelMode,
    onSelectChannel,
    activeChannelPetName,
  },
  path = [],
) => {
  const $list = $parent.querySelector('.pet-list') || $parent;

  // Update header text for channel mode
  if (channelMode && path.length === 0) {
    const $title = $parent.querySelector('.inventory-title');
    if ($title) {
      $title.textContent = 'Channels';
    }

    // Add channel action buttons if not already present
    const $header = $parent.querySelector('.inventory-header');
    if ($header && !$header.querySelector('.channel-actions')) {
      const $actions = document.createElement('span');
      $actions.className = 'channel-actions';

      const $newBtn = document.createElement('button');
      $newBtn.className = 'channel-action-btn';
      $newBtn.textContent = 'New';
      $newBtn.title = 'Create a new channel';

      const $joinBtn = document.createElement('button');
      $joinBtn.className = 'channel-action-btn';
      $joinBtn.textContent = 'Join';
      $joinBtn.title = 'Join an existing channel';

      $actions.appendChild($newBtn);
      $actions.appendChild($joinBtn);

      // Insert before the toggle label
      const $toggle = $header.querySelector('.inventory-toggle');
      if ($toggle) {
        $header.insertBefore($actions, $toggle);
      } else {
        $header.appendChild($actions);
      }

      // Inline form container (shared between New and Join)
      let $inlineForm = $parent.querySelector('.channel-inline-form');
      if (!$inlineForm) {
        $inlineForm = document.createElement('div');
        $inlineForm.className = 'channel-inline-form';
        // Insert between header and pet-list
        const $petList = $parent.querySelector('.pet-list');
        if ($petList) {
          $parent.insertBefore($inlineForm, $petList);
        } else {
          $parent.appendChild($inlineForm);
        }
      }

      /**
       * Show the "New Channel" inline form.
       */
      const showNewForm = () => {
        if (!$inlineForm) return;
        $inlineForm.innerHTML = '';
        $inlineForm.classList.add('visible');

        const $form = document.createElement('div');
        $form.className = 'channel-form';

        const $nameInput = document.createElement('input');
        $nameInput.type = 'text';
        $nameInput.placeholder = 'Channel name';
        $nameInput.className = 'channel-form-input';

        const $displayInput = document.createElement('input');
        $displayInput.type = 'text';
        $displayInput.placeholder = 'Your display name';
        $displayInput.className = 'channel-form-input';

        const $btnRow = document.createElement('div');
        $btnRow.className = 'channel-form-buttons';

        const $createBtn = document.createElement('button');
        $createBtn.className = 'channel-form-submit';
        $createBtn.textContent = 'Create';

        const $cancelBtn = document.createElement('button');
        $cancelBtn.className = 'channel-form-cancel';
        $cancelBtn.textContent = 'Cancel';

        $btnRow.appendChild($createBtn);
        $btnRow.appendChild($cancelBtn);

        $form.appendChild($nameInput);
        $form.appendChild($displayInput);
        $form.appendChild($btnRow);
        $inlineForm.appendChild($form);

        $nameInput.focus();

        $cancelBtn.onclick = () => {
          $inlineForm.classList.remove('visible');
          $inlineForm.innerHTML = '';
        };

        $createBtn.onclick = async () => {
          const petName = $nameInput.value.trim();
          const displayName = $displayInput.value.trim();
          if (!petName || !displayName) return;

          $createBtn.disabled = true;
          $createBtn.textContent = 'Creating...';
          try {
            await E(powers).makeChannel(petName, displayName);
            $inlineForm.classList.remove('visible');
            $inlineForm.innerHTML = '';
            // Auto-select the new channel
            if (onSelectChannel) {
              onSelectChannel(petName);
            }
          } catch (err) {
            window.reportError(/** @type {Error} */ (err));
            $createBtn.disabled = false;
            $createBtn.textContent = 'Create';
          }
        };

        // Submit on Enter in last input
        $displayInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            $createBtn.click();
          }
        });
      };

      /**
       * Show the "Join Channel" inline form.
       */
      const showJoinForm = () => {
        if (!$inlineForm) return;
        $inlineForm.innerHTML = '';
        $inlineForm.classList.add('visible');

        const $form = document.createElement('div');
        $form.className = 'channel-form';

        const $locatorInput = document.createElement('input');
        $locatorInput.type = 'text';
        $locatorInput.placeholder = 'Locator URL';
        $locatorInput.className = 'channel-form-input';

        const $nameInput = document.createElement('input');
        $nameInput.type = 'text';
        $nameInput.placeholder = 'Channel name (local)';
        $nameInput.className = 'channel-form-input';

        const $btnRow = document.createElement('div');
        $btnRow.className = 'channel-form-buttons';

        const $joinSubmit = document.createElement('button');
        $joinSubmit.className = 'channel-form-submit';
        $joinSubmit.textContent = 'Join';

        const $cancelBtn = document.createElement('button');
        $cancelBtn.className = 'channel-form-cancel';
        $cancelBtn.textContent = 'Cancel';

        $btnRow.appendChild($joinSubmit);
        $btnRow.appendChild($cancelBtn);

        $form.appendChild($locatorInput);
        $form.appendChild($nameInput);
        $form.appendChild($btnRow);
        $inlineForm.appendChild($form);

        $locatorInput.focus();

        $cancelBtn.onclick = () => {
          $inlineForm.classList.remove('visible');
          $inlineForm.innerHTML = '';
        };

        $joinSubmit.onclick = async () => {
          const locator = $locatorInput.value.trim();
          const petName = $nameInput.value.trim();
          if (!locator || !petName) return;

          $joinSubmit.disabled = true;
          $joinSubmit.textContent = 'Joining...';
          try {
            // Parse formula ID from locator URL
            const url = new URL(locator);
            const formulaNumber = url.searchParams.get('id');
            const nodeNumber = url.hostname;
            if (!formulaNumber) {
              throw new Error('Invalid locator: missing formula id');
            }
            // Register peer info from connection hints so the daemon
            // knows how to reach the remote node.
            const addresses = url.searchParams.getAll('at');
            if (addresses.length > 0 && nodeNumber) {
              await E(
                /** @type {{ addPeerInfo: (info: { node: string, addresses: string[] }) => Promise<void> }} */ (
                  powers
                ),
              ).addPeerInfo({ node: nodeNumber, addresses });
            }
            const formulaId = `${formulaNumber}:${nodeNumber}`;
            await E(powers).write(petName, formulaId);
            $inlineForm.classList.remove('visible');
            $inlineForm.innerHTML = '';
            // Auto-select the new channel
            if (onSelectChannel) {
              onSelectChannel(petName);
            }
          } catch (err) {
            window.reportError(/** @type {Error} */ (err));
            $joinSubmit.disabled = false;
            $joinSubmit.textContent = 'Join';
          }
        };

        // Submit on Enter in last input
        $nameInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            $joinSubmit.click();
          }
        });
      };

      $newBtn.onclick = showNewForm;
      $joinBtn.onclick = showJoinForm;
    }
  }

  /** @type {Map<string, { $wrapper: HTMLElement, cleanup?: () => void }>} */
  const $names = new Map();

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

    // Probe the formula type to detect conversable items and non-expandable types.
    // Items without a locator (e.g. children of an immutable ReadableTree) get
    // their remove button disabled since they cannot be individually removed.
    E(powers)
      .locate(.../** @type {[string, ...string[]]} */ (itemPath))
      .then(locator => {
        if (!locator) {
          $remove.disabled = true;
          $remove.title = 'Cannot remove (immutable)';
          return;
        }
        const url = new URL(/** @type {string} */ (locator));
        const type = url.searchParams.get('type');

        // Hide disclosure triangle for known non-expandable types
        if (type && NON_EXPANDABLE_TYPES.includes(type)) {
          $disclosure.classList.add('hidden');
        }

        // Channel mode: make channel items selectable
        if (channelMode && type === 'channel' && onSelectChannel) {
          $wrapper.classList.add('channel-item');
          $name.title = 'Switch to this channel';
          $name.classList.add('selectable');
          $name.onclick = () => {
            onSelectChannel(name);
          };
          if (
            activeChannelPetName &&
            path.length === 0 &&
            name === activeChannelPetName
          ) {
            $wrapper.classList.add('active-channel');
          }
        }

        // Non-channel mode: detect conversable items
        if (!channelMode && onSelectConversation) {
          if (type && CONVERSABLE_TYPES.includes(type)) {
            $wrapper.classList.add('conversable');
            $name.title = 'Open conversation';
            $name.onclick = () => {
              onSelectConversation(name, /** @type {string} */ (locator));
            };
            if (
              activeConversationPetName &&
              path.length === 0 &&
              name === activeConversationPetName
            ) {
              $wrapper.classList.add('active-conversation');
            }
          }
        }
      })
      .catch(() => {
        // Item may have been removed
      });

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
          // Use __getMethodNames__ to detect the target's capabilities
          // without probing methods that may not exist (avoids CapTP noise).
          const methods = await E(target).__getMethodNames__();

          /** @type {ERef<EndoHost> | undefined} */
          let nestedPowers;

          if (methods.includes('followNameChanges')) {
            // NameHub (directory, host, guest): use live subscription
            const changesIterator = E(
              /** @type {import('@endo/far').ERef<EndoHost>} */ (target),
            ).followNameChanges();

            nestedPowers = /** @type {ERef<EndoHost>} */ (
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
          } else if (methods.includes('list')) {
            // Static tree (ReadableTree, etc.): populate from list()
            const names = await E(target).list();
            nestedPowers = makeStaticTreePowers(target, names);
          }

          if (nestedPowers) {
            isExpanded = true;
            $disclosure.classList.remove('loading');
            $disclosure.classList.add('expanded');
            $disclosure.title = 'Collapse';
            $children.classList.add('expanded');

            inventoryComponent(
              $children,
              null,
              nestedPowers,
              {
                showValue,
                onSelectConversation,
                activeConversationPetName,
                channelMode,
                onSelectChannel,
                activeChannelPetName,
              },
              [], // Reset path since nestedPowers handles the prefix
            ).catch(() => {
              // Silently handle errors (e.g., if the item is removed)
            });
          } else {
            // Not expandable (no list or followNameChanges)
            $disclosure.classList.remove('loading');
            $disclosure.classList.add('hidden');
          }
        } catch {
          // Lookup or introspection failed
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
