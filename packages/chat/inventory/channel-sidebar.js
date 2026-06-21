// @ts-check
/* eslint-disable no-continue */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { E } from '@endo/far';

import { makeChannelReorder } from './dnd.js';

// The channels sidebar: the channel-mode behavior that used to be woven
// through inventory.js behind a `channelMode` flag. The inventory module is
// now a mode-agnostic pet-name tree renderer with hook points; this provides
// the channel-specific contributions (header New/Join forms, per-channel
// decoration, bookmarks, reordering) as a `sidebar` config it consumes. Still
// imperative — see designs/preact-confinement-migration.md (its own Preact
// migration is a later, separate effort).

/**
 * @typedef {object} ChannelSidebarConfig
 * @property {ERef<EndoHost>} powers - Powers for the current profile, used to
 *   create (`makeChannel`) and join (`storeLocator`) channels.
 * @property {(channelPetName: string) => void} [onSelectChannel]
 * @property {string | null} [activeChannelPetName]
 * @property {string[]} [channelOrder]
 * @property {(order: string[]) => void} [onChannelReorder]
 * @property {Array<{ key: string, channelPetName: string, label: string }>} [bookmarks]
 * @property {(channelPetName: string, threadKey: string) => void} [onSelectBookmark]
 * @property {(bookmark: { key: string, channelPetName: string, label: string }) => void} [onRemoveBookmark]
 * @property {'chat' | 'forum' | 'outliner' | 'microblog'} [viewMode]
 * @property {(mode: 'chat' | 'forum' | 'outliner' | 'microblog') => void} [onViewModeChange]
 */

/**
 * Per-item rendering context the inventory passes to `decorateItem`.
 *
 * @typedef {object} ItemContext
 * @property {string} name
 * @property {string | null} type - Formula type from the locator probe.
 * @property {string[]} path
 * @property {HTMLElement} $list
 * @property {HTMLElement} $wrapper
 * @property {HTMLElement} $row
 * @property {(partial: { title?: string, selectable?: boolean, onClick?: () => void }) => void} setLabel
 *   - Update the item's label (name) — title, selectable, click handler.
 * @property {(partial: { hidden?: boolean, loading?: boolean, expanded?: boolean }) => void} setDisclosure
 *   - Update the item's disclosure triangle.
 * @property {HTMLElement} $children
 * @property {HTMLElement} $actions
 */

/**
 * Build the channel sidebar's contribution to the inventory renderer.
 *
 * @param {ChannelSidebarConfig} config
 */
export const makeChannelSidebar = config => {
  const {
    powers,
    onSelectChannel,
    activeChannelPetName,
    channelOrder,
    onChannelReorder,
    bookmarks,
    onSelectBookmark,
    onRemoveBookmark,
    viewMode,
    onViewModeChange,
  } = config;

  const channelReorder = makeChannelReorder();

  /**
   * Set up the channel-mode header: title, New/Join buttons, and their inline
   * forms. Called once at the top level.
   *
   * @param {HTMLElement} $parent
   */
  const setupHeader = $parent => {
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
            // Validate the locator URL and extract connection hints.
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
                  /** @type {unknown} */ (powers)
                ),
              ).addPeerInfo({ node: nodeNumber, addresses });
            }
            // Pass the original endo:// locator to storeLocator so the
            // system can drop bare-identifier support in the future.
            await E(powers).storeLocator(petName, locator);
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
  };

  /**
   * Decorate a freshly-probed item. Only channel-typed items are shown and
   * made selectable; everything else stays hidden (the inventory hid it up
   * front for sidebar mode).
   *
   * @param {ItemContext} ctx
   */
  const decorateItem = ctx => {
    const {
      name,
      type,
      path,
      $list,
      $wrapper,
      $row,
      setLabel,
      setDisclosure,
      $children,
      $actions,
    } = ctx;
    if (type !== 'channel' || !onSelectChannel) return;

    $wrapper.style.display = '';
    $wrapper.classList.add('channel-item');
    $wrapper.dataset.name = name;
    setLabel({
      title: 'Switch to this channel',
      selectable: true,
      onClick: () => {
        onSelectChannel(name);
      },
    });
    if (
      activeChannelPetName &&
      path.length === 0 &&
      name === activeChannelPetName
    ) {
      $wrapper.classList.add('active-channel');
    }

    // Per-channel three-dot menu for view mode switching
    if (onViewModeChange) {
      const $menuBtn = document.createElement('button');
      $menuBtn.className = 'channel-sidebar-menu-btn';
      $menuBtn.textContent = '⋮';
      $menuBtn.title = 'Channel options';
      $menuBtn.addEventListener('click', menuE => {
        menuE.stopPropagation();
        // Remove any existing sidebar menus
        const $existing = document.querySelector('.channel-sidebar-menu');
        if ($existing) $existing.remove();

        const $menu = document.createElement('div');
        $menu.className = 'channel-sidebar-menu';
        const modes =
          /** @type {Array<'chat' | 'forum' | 'outliner' | 'microblog'>} */ ([
            'chat',
            'forum',
            'outliner',
            'microblog',
          ]);
        for (const mode of modes) {
          const $item = document.createElement('button');
          $item.className = 'channel-sidebar-menu-item';
          if (mode === viewMode) $item.classList.add('active');
          $item.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
          $item.addEventListener('click', () => {
            $menu.remove();
            onViewModeChange(mode);
          });
          $menu.appendChild($item);
        }

        // Position relative to button
        const rect = $menuBtn.getBoundingClientRect();
        $menu.style.position = 'fixed';
        $menu.style.left = `${rect.right + 4}px`;
        $menu.style.top = `${rect.top}px`;
        document.body.appendChild($menu);

        const dismiss = () => {
          $menu.remove();
          document.removeEventListener('click', dismiss);
        };
        requestAnimationFrame(() => {
          document.addEventListener('click', dismiss);
        });
      });
      $actions.insertBefore($menuBtn, $actions.firstChild);
    }

    // Reorder according to stored channel order
    if (channelOrder) {
      const orderIdx = channelOrder.indexOf(name);
      if (orderIdx >= 0) {
        const existingItems = /** @type {NodeListOf<HTMLElement>} */ (
          $list.querySelectorAll('.channel-item[data-name]')
        );
        let reinserted = false;
        for (const item of existingItems) {
          if (item === $wrapper) continue;
          const itemIdx = channelOrder.indexOf(
            /** @type {string} */ (item.dataset.name),
          );
          if (itemIdx < 0 || itemIdx > orderIdx) {
            $list.insertBefore($wrapper, item);
            reinserted = true;
            break;
          }
        }
        if (!reinserted) {
          $list.appendChild($wrapper);
        }
      }
    }

    // Make channel items draggable for reordering
    channelReorder.attachDragSource($row, $wrapper, name);

    // Render bookmarked threads under this channel
    if (bookmarks && bookmarks.length > 0) {
      const channelBookmarks = bookmarks.filter(b => b.channelPetName === name);
      if (channelBookmarks.length > 0) {
        for (const bm of channelBookmarks) {
          const $bmItem = document.createElement('div');
          $bmItem.className = 'bookmarked-thread-item';
          $bmItem.dataset.key = bm.key;
          $bmItem.dataset.channel = bm.channelPetName;
          const $bmLabel = document.createElement('span');
          $bmLabel.className = 'bookmark-label';
          $bmLabel.textContent = `★ ${bm.label}`;
          $bmLabel.title = `Thread #${bm.key} in ${bm.channelPetName}`;
          $bmItem.appendChild($bmLabel);
          if (onSelectBookmark) {
            $bmItem.style.cursor = 'pointer';
            $bmItem.addEventListener('click', () => {
              onSelectBookmark(bm.channelPetName, bm.key);
            });
          }
          if (onRemoveBookmark) {
            $bmItem.addEventListener('contextmenu', ctxE => {
              ctxE.preventDefault();
              const $menu = document.createElement('div');
              $menu.className = 'bookmark-context-menu';
              const $removeBtn = document.createElement('button');
              $removeBtn.textContent = 'Remove bookmark';
              $removeBtn.addEventListener('click', () => {
                onRemoveBookmark(bm);
                $bmItem.remove();
                $menu.remove();
              });
              $menu.appendChild($removeBtn);
              $menu.style.position = 'fixed';
              $menu.style.left = `${ctxE.clientX}px`;
              $menu.style.top = `${ctxE.clientY}px`;
              document.body.appendChild($menu);
              const dismiss = () => {
                $menu.remove();
                document.removeEventListener('click', dismiss);
              };
              requestAnimationFrame(() => {
                document.addEventListener('click', dismiss);
              });
            });
          }
          $children.appendChild($bmItem);
        }
        // Show the children container and mark the disclosure expanded.
        $children.style.display = '';
        setDisclosure({ expanded: true });
      }
    }
  };

  /**
   * Wire the list-level reorder drop zone.
   *
   * @param {HTMLElement} $list
   */
  const setupList = $list => {
    channelReorder.attachReorderZone($list, { onReorder: onChannelReorder });
  };

  return harden({
    // Newest channels at the top; items start hidden until confirmed channels.
    prepend: true,
    itemInitiallyHidden: true,
    setupHeader,
    decorateItem,
    setupList,
  });
};
harden(makeChannelSidebar);
