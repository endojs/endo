// @ts-check
/* global document, window */
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { createAddSpaceModal } from './add-space-modal.js';
import { createEditSpaceModal } from './edit-space-modal.js';
import { makeRefIterator } from './ref-iterator.js';

/**
 * @typedef {'auto' | 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark'} ColorScheme
 */

/**
 * @typedef {object} SpaceConfig
 * @property {string} id - unique identifier (sequential integer as string, e.g., "1", "2")
 * @property {string} name - display name (shown on hover)
 * @property {string} icon - emoji character
 * @property {string[]} profilePath - pet-name path to the agent
 * @property {'inbox' | 'channel'} mode - interaction mode
 * @property {ColorScheme} [scheme] - color scheme preference (default: 'auto')
 * @property {string} [channelPetName] - pet name of the channel object (for channel mode)
 * @property {string} [proposedName] - display name for the channel creator
 */

/**
 * @typedef {object} SpacesGutterAPI
 * @property {() => Promise<void>} refresh - Reload spaces from pet-store
 * @property {(id: string) => void} selectSpace - Activate a space
 * @property {() => SpaceConfig[]} getSpaces - Get current space list
 * @property {(config: Omit<SpaceConfig, 'id'>) => Promise<string>} addSpace - Add a new space
 * @property {(id: string, updates: Partial<Pick<SpaceConfig, 'name' | 'icon' | 'scheme'>>) => Promise<void>} updateSpace - Update a space
 * @property {(id: string) => Promise<void>} removeSpace - Remove a space
 * @property {() => string} getActiveSpaceId - Get currently active space ID
 */

/** @type {SpaceConfig} */
const HOME_SPACE_DEFAULTS = harden({
  id: 'home',
  name: 'Home',
  icon: '🐈‍⬛',
  profilePath: [],
  mode: 'inbox',
  scheme: 'auto',
});
harden(HOME_SPACE_DEFAULTS);

const validSchemes = harden([
  'auto',
  'light',
  'dark',
  'high-contrast-light',
  'high-contrast-dark',
]);
harden(validSchemes);

/**
 * Check if two profile paths are equal.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
const pathsEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((segment, i) => segment === b[i]);
};
harden(pathsEqual);

/**
 * Create the spaces gutter component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the gutter
 * @param {HTMLElement} options.$modalContainer - Container for the add space modal
 * @param {ERef<EndoHost>} options.powers - Endo host powers
 * @param {string[]} options.currentProfilePath - Current profile path for initial selection
 * @param {(profilePath: string[], spaceInfo?: { mode: 'inbox' | 'channel', channelPetName?: string, proposedName?: string }) => void} options.onNavigate - Navigate callback
 * @returns {SpacesGutterAPI}
 */
export const createSpacesGutter = ({
  $container,
  $modalContainer,
  powers,
  currentProfilePath,
  onNavigate,
}) => {
  /** @type {Map<string, SpaceConfig>} */
  const spacesMap = new Map();
  /** @type {SpaceConfig} */
  let homeSpaceConfig = HOME_SPACE_DEFAULTS;
  /** @type {string} */
  let activeSpaceId = 'home'; // Will be updated after loading spaces

  /**
   * Get spaces as sorted array.
   *
   * @returns {SpaceConfig[]}
   */
  const getSpacesArray = () => {
    return [...spacesMap.values()].sort(
      (a, b) => parseInt(a.id, 10) - parseInt(b.id, 10),
    );
  };

  /**
   * Find the space ID that matches a profile path.
   *
   * @param {string[]} profilePath
   * @returns {string} The matching space ID, or 'home' if none matches
   */
  const findSpaceForPath = profilePath => {
    // Empty path is home
    if (profilePath.length === 0) {
      return 'home';
    }
    // Check user spaces
    for (const space of spacesMap.values()) {
      if (pathsEqual(space.profilePath, profilePath)) {
        return space.id;
      }
    }
    // No match, default to home
    return 'home';
  };

  /**
   * Update active space based on current profile path.
   */
  const syncActiveSpaceToPath = () => {
    activeSpaceId = findSpaceForPath(currentProfilePath);
  };

  /**
   * Handle when the active space is removed - refocus on home.
   */
  const handleActiveSpaceRemoved = () => {
    if (activeSpaceId !== 'home' && !spacesMap.has(activeSpaceId)) {
      activeSpaceId = 'home';
      onNavigate(homeSpaceConfig.profilePath);
    }
  };

  /**
   * Add a new space.
   *
   * @param {Omit<SpaceConfig, 'id'>} config
   * @returns {Promise<string>}
   */
  const addSpace = async config => {
    // Generate next sequential ID
    const existingIds = [...spacesMap.keys()]
      .map(id => parseInt(id, 10))
      .filter(n => !Number.isNaN(n));
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const id = String(nextId);
    const spaceConfig = harden({ ...config, id });

    // Ensure 'spaces' directory exists
    await null; // safe-await-separator
    try {
      await E(powers).lookup('spaces');
    } catch {
      // Directory doesn't exist, create it
      await E(powers).makeDirectory('spaces');
    }

    // Store as passable object (not JSON)
    await E(powers).storeValue(spaceConfig, ['spaces', id]);

    // Add to map immediately and select the new space
    spacesMap.set(id, spaceConfig);
    selectSpace(id);

    return id;
  };

  /**
   * Remove a space and clean up associated daemon-level pet names
   * and browser-side address book entries.
   *
   * For channel spaces:
   * - The handle and agent pet names in the root pet store are removed
   *   so that recreating a space with the same name produces a fresh agent.
   * - All localStorage address-book entries scoped to this persona are
   *   cleared so a recreated space starts with an empty address book.
   *
   * @param {string} id
   * @returns {Promise<void>}
   */
  const removeSpace = async id => {
    // Cannot remove home space
    if (id === 'home') return;

    await null; // safe-await-separator

    // Look up the space config before removing it so we know what to clean up.
    const config = spacesMap.get(id);
    if (config && config.mode === 'channel' && config.profilePath.length > 0) {
      const agentPetName = config.profilePath[0];
      // config.name is the spaceName passed to provideHost (the handle pet name).
      const handlePetName = config.name;

      // Clear browser-side address book entries for this persona.
      // The channelComponent stores nicknames under keys like
      // "channel-names:<personaId>:<channelName>" where personaId is
      // profilePath.join('.').  Without this cleanup, recreating a space
      // with the same name would inherit the old persona's nicknames.
      try {
        const personaId = config.profilePath.join('.');
        const prefix = `channel-names:${personaId}:`;
        const keysToRemove = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // localStorage not available
      }

      // Remove the handle so provideHost creates a new agent next time.
      try {
        await E(powers).remove(handlePetName);
      } catch {
        // May not exist
      }
      // Remove the agent pet name so the old agent can be garbage collected.
      try {
        await E(powers).remove(agentPetName);
      } catch {
        // May not exist
      }
    }

    try {
      await E(powers).remove('spaces', id);
    } catch {
      // May not exist
    }
    // The watcher will pick up the change and update spacesMap
  };

  /**
   * Update an existing space's configuration.
   *
   * @param {string} id
   * @param {Partial<Pick<SpaceConfig, 'name' | 'icon' | 'scheme'>>} updates
   * @returns {Promise<void>}
   */
  const updateSpace = async (id, updates) => {
    if (id === 'home') {
      // Home space: enforce indelible name and profilePath
      const updated = harden({
        ...homeSpaceConfig,
        ...updates,
        name: 'Home',
        profilePath: [],
        id: 'home',
        mode: 'inbox',
      });

      await null; // safe-await-separator
      // Ensure 'spaces' directory exists
      try {
        await E(powers).lookup('spaces');
      } catch {
        await E(powers).makeDirectory('spaces');
      }
      await E(powers).storeValue(updated, ['spaces', '0']);

      homeSpaceConfig = updated;

      // If home is active, apply the new scheme
      if (activeSpaceId === 'home') {
        applyScheme(updated.scheme);
      }
      render();
      return;
    }

    const existing = spacesMap.get(id);
    if (!existing) return;

    const updated = harden({
      ...existing,
      ...updates,
    });

    await null; // safe-await-separator
    await E(powers).storeValue(updated, ['spaces', id]);

    spacesMap.set(id, updated);

    // If this is the active space, apply the new scheme
    if (id === activeSpaceId) {
      applyScheme(updated.scheme);
    }
    render();
  };

  /**
   * Apply a color scheme to the document.
   *
   * @param {ColorScheme} [scheme]
   */
  const applyScheme = scheme => {
    if (!scheme || scheme === 'auto') {
      document.documentElement.removeAttribute('data-scheme');
    } else {
      document.documentElement.setAttribute('data-scheme', scheme);
    }
    // Notify Monaco editors to update their theme
    document.dispatchEvent(new CustomEvent('endo-theme-change'));
  };

  /**
   * Select and activate a space.
   *
   * @param {string} id
   */
  const selectSpace = id => {
    // Handle home space specially
    if (id === 'home') {
      activeSpaceId = 'home';
      applyScheme(homeSpaceConfig.scheme);
      render();
      onNavigate(homeSpaceConfig.profilePath);
      return;
    }

    const space = spacesMap.get(id);
    if (!space) return;

    activeSpaceId = id;
    applyScheme(space.scheme);
    render();
    onNavigate(space.profilePath, {
      mode: space.mode,
      channelPetName: space.channelPetName,
      proposedName: space.proposedName,
    });
  };

  /** @type {string | null} */
  let contextMenuSpaceId = null;

  /**
   * Hide the context menu.
   */
  const hideContextMenu = () => {
    const $menu = $container.querySelector('.space-context-menu');
    if ($menu) {
      $menu.classList.remove('visible');
    }
    contextMenuSpaceId = null;
  };

  /**
   * Show the context menu at the given position.
   * @param {string} spaceId
   * @param {number} x
   * @param {number} y
   */
  const showContextMenu = (spaceId, x, y) => {
    const $menu = /** @type {HTMLElement | null} */ (
      $container.querySelector('.space-context-menu')
    );
    if (!$menu) return;

    contextMenuSpaceId = spaceId;
    const space =
      spaceId === 'home' ? homeSpaceConfig : spacesMap.get(spaceId);
    const $title = $menu.querySelector('.context-menu-title');
    if ($title && space) {
      $title.textContent = space.name;
    }

    // Toggle menu item visibility based on scope
    const isIndelible = spaceId === 'home';
    for (const $item of $menu.querySelectorAll('[data-menu-scope]')) {
      const scope = $item.getAttribute('data-menu-scope');
      /** @type {HTMLElement} */ ($item).style.display =
        scope === 'all' || (!isIndelible && scope === 'delible') ? '' : 'none';
    }

    // Position the menu
    $menu.style.left = `${x}px`;
    $menu.style.top = `${y}px`;
    $menu.classList.add('visible');

    // Adjust if menu goes off screen
    const rect = $menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      $menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      $menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  };

  /**
   * Render the gutter UI.
   */
  const render = () => {
    // Sort user spaces by id (numeric), home space is always first
    const sortedUserSpaces = getSpacesArray();
    const allSpaces = [homeSpaceConfig, ...sortedUserSpaces];

    let html = `
      <div class="spaces-gutter-inner">
        <div class="spaces-list">
    `;

    allSpaces.forEach((space, index) => {
      const isActive = space.id === activeSpaceId;
      const isHome = space.id === 'home';
      // 1-indexed shortcuts: ⌘1=home, ⌘2=first user space, etc.
      const shortcutNum = index + 1;
      const hasShortcut = shortcutNum >= 1 && shortcutNum <= 9;
      const shortcutHint = hasShortcut ? `⌘${shortcutNum}` : '';

      html += `
        <div class="space-item ${isActive ? 'active' : ''}${isHome ? ' home' : ''}"
             data-space-id="${space.id}"
             title="${space.name}${shortcutHint ? ` (${shortcutHint})` : ''}">
          <span class="space-icon">${space.icon}</span>
          <span class="space-badge" style="display: none;">0</span>
          ${hasShortcut ? `<span class="space-shortcut-badge">${shortcutNum}</span>` : ''}
        </div>
      `;
    });

    html += `
          <div class="space-item add-space-item" title="Add space">
            <button class="add-space-button">+</button>
          </div>
        </div>
      </div>
      <div class="space-context-menu">
        <div class="context-menu-title"></div>
        <button class="context-menu-item" data-action="edit" data-menu-scope="all">
          <span class="context-menu-icon">✏️</span>
          <span>Edit Space</span>
        </button>
        <button class="context-menu-item context-menu-delete" data-action="delete" data-menu-scope="delible">
          <span class="context-menu-icon">🗑</span>
          <span>Delete Space</span>
        </button>
      </div>
    `;

    $container.innerHTML = html;

    // Attach context menu handlers
    const $contextMenu = $container.querySelector('.space-context-menu');
    if ($contextMenu) {
      const $editBtn = $contextMenu.querySelector('[data-action="edit"]');
      if ($editBtn) {
        $editBtn.addEventListener('click', () => {
          if (contextMenuSpaceId) {
            if (contextMenuSpaceId === 'home') {
              homeEditModal.show(homeSpaceConfig);
            } else {
              const space = spacesMap.get(contextMenuSpaceId);
              if (space) {
                editSpaceModal.show(space);
              }
            }
          }
          hideContextMenu();
        });
      }

      const $deleteBtn = $contextMenu.querySelector('[data-action="delete"]');
      if ($deleteBtn) {
        $deleteBtn.addEventListener('click', () => {
          if (contextMenuSpaceId) {
            removeSpace(contextMenuSpaceId);
          }
          hideContextMenu();
        });
      }

      // Prevent clicks inside context menu from closing it
      $contextMenu.addEventListener('click', e => {
        e.stopPropagation();
      });
    }

    // Attach click handlers for space items
    const $spaceItems = $container.querySelectorAll('.space-item');
    for (const $item of $spaceItems) {
      $item.addEventListener('click', () => {
        const spaceId = $item.getAttribute('data-space-id');
        if (spaceId) {
          selectSpace(spaceId);
        }
      });

      // Right-click context menu
      $item.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const spaceId = $item.getAttribute('data-space-id');
        if (spaceId) {
          const mouseEvent = /** @type {MouseEvent} */ (e);
          showContextMenu(spaceId, mouseEvent.clientX, mouseEvent.clientY);
        }
      });
    }

    // Attach click handler for add button
    const $addButton = $container.querySelector('.add-space-button');
    if ($addButton) {
      $addButton.addEventListener('click', () => {
        showAddSpaceDialog();
      });
    }
  };

  // Initialize the add space modal
  const addSpaceModal = createAddSpaceModal({
    $container: $modalContainer,
    powers,
    getUsedIcons: () => {
      const icons = new Set();
      // Home space icon is always considered used
      icons.add(homeSpaceConfig.icon);
      for (const space of spacesMap.values()) {
        icons.add(space.icon);
      }
      return icons;
    },
    onSubmit: async data => {
      const spaceConfig = {
        name: data.name,
        icon: data.icon,
        profilePath: data.profilePath,
        mode: data.layout === 'channel' ? 'channel' : 'inbox',
        scheme: data.scheme || 'auto',
      };
      if (data.channelPetName) {
        spaceConfig.channelPetName = data.channelPetName;
      }
      if (data.proposedName) {
        spaceConfig.proposedName = data.proposedName;
      }
      await addSpace(spaceConfig);
    },
    onClose: () => {
      // Modal closed
    },
    getExistingChannelSpaces: () => {
      const result = [];
      for (const space of spacesMap.values()) {
        if (space.mode === 'channel') {
          result.push({
            id: space.id,
            name: space.name,
            icon: space.icon,
            profilePath: space.profilePath,
          });
        }
      }
      return result;
    },
  });

  // Initialize the edit space modal (for regular spaces)
  const editSpaceModal = createEditSpaceModal({
    $container: $modalContainer,
    onSubmit: async (id, data) => {
      await updateSpace(id, {
        name: data.name,
        icon: data.icon,
        scheme: data.scheme || 'auto',
      });
    },
    onClose: () => {
      // Modal closed
    },
  });

  // Initialize the home edit modal (no name field)
  const homeEditModal = createEditSpaceModal({
    $container: $modalContainer,
    showName: false,
    onSubmit: async (_id, data) => {
      await updateSpace('home', {
        icon: data.icon,
        scheme: data.scheme || 'auto',
      });
    },
    onClose: () => {
      // Modal closed
    },
  });

  /**
   * Show dialog to add a new space.
   */
  const showAddSpaceDialog = () => {
    addSpaceModal.show();
  };

  /**
   * Validate that a value is a valid SpaceConfig.
   *
   * @param {unknown} value
   * @param {string} id
   * @returns {SpaceConfig | null}
   */
  const validateSpaceConfig = (value, id) => {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const obj = /** @type {Record<string, unknown>} */ (value);
    // Must have required string fields
    if (typeof obj.name !== 'string') return null;
    if (typeof obj.icon !== 'string') return null;
    if (!Array.isArray(obj.profilePath)) return null;
    if (!obj.profilePath.every(p => typeof p === 'string')) return null;
    // Mode is optional, default to 'inbox'
    const mode = obj.mode === 'channel' ? 'channel' : 'inbox';
    // Scheme is optional, default to 'auto'
    const scheme =
      typeof obj.scheme === 'string' && validSchemes.includes(obj.scheme)
        ? /** @type {ColorScheme} */ (obj.scheme)
        : 'auto';
    const result = {
      id,
      name: obj.name,
      icon: obj.icon,
      profilePath: obj.profilePath,
      mode,
      scheme,
    };
    if (typeof obj.channelPetName === 'string') {
      result.channelPetName = obj.channelPetName;
    }
    if (typeof obj.proposedName === 'string') {
      result.proposedName = obj.proposedName;
    }
    return /** @type {SpaceConfig} */ (harden(result));
  };

  /**
   * Load a single space config from the pet-store.
   *
   * @param {string} id
   * @returns {Promise<SpaceConfig | null>}
   */
  const loadSpaceConfig = async id => {
    try {
      // eslint-disable-next-line @jessie.js/safe-await-separator
      const value = await E(powers).lookup(['spaces', id]);
      return validateSpaceConfig(value, id);
    } catch {
      return null;
    }
  };

  /**
   * Handle a space being added.
   *
   * @param {string} id
   */
  const handleSpaceAdded = async id => {
    if (id === '0') {
      // Reload home config
      const config = await loadSpaceConfig('0');
      if (config) {
        homeSpaceConfig = harden({
          ...HOME_SPACE_DEFAULTS,
          icon: config.icon,
          scheme: config.scheme,
        });
        if (activeSpaceId === 'home') {
          applyScheme(homeSpaceConfig.scheme);
        }
      }
      render();
      return;
    }
    const config = await loadSpaceConfig(id);
    if (config) {
      spacesMap.set(id, config);
      render();
    }
  };

  /**
   * Handle a space being removed.
   *
   * @param {string} id
   */
  const handleSpaceRemoved = id => {
    if (id === '0') {
      homeSpaceConfig = HOME_SPACE_DEFAULTS;
      if (activeSpaceId === 'home') {
        applyScheme(homeSpaceConfig.scheme);
      }
      render();
      return;
    }
    spacesMap.delete(id);
    handleActiveSpaceRemoved();
    render();
  };

  /**
   * Watch the spaces directory for changes.
   *
   * @returns {Promise<void>}
   */
  const watchSpaces = async () => {
    await null; // safe-await-separator
    try {
      // Ensure spaces directory exists
      try {
        await E(powers).lookup('spaces');
      } catch {
        // Directory doesn't exist yet, create it
        await E(powers).makeDirectory('spaces');
      }

      // Get the spaces directory and watch for changes
      const spacesDir = await E(powers).lookup('spaces');
      const changesRef = E(
        /** @type {ERef<EndoHost>} */ (spacesDir),
      ).followNameChanges();
      const changes = makeRefIterator(changesRef);

      for await (const change of changes) {
        const { add, remove } =
          /** @type {{ add?: string, remove?: string }} */ (change);
        if (add) {
          handleSpaceAdded(add).catch(window.reportError);
        }
        if (remove) {
          handleSpaceRemoved(remove);
        }
      }
    } catch {
      // Watching failed - fall back to non-reactive behavior
    }
  };

  /**
   * Load spaces from pet-store.
   *
   * @returns {Promise<void>}
   */
  const refresh = async () => {
    spacesMap.clear();
    homeSpaceConfig = HOME_SPACE_DEFAULTS;

    await null; // safe-await-separator
    try {
      // Check if 'spaces' directory exists by trying to list it
      const spaceIds = await E(powers).list('spaces');

      // Load all space configs in parallel
      const loadPromises = [];
      for await (const id of spaceIds) {
        loadPromises.push(
          loadSpaceConfig(id).then(config => {
            if (config) {
              if (id === '0') {
                // Space 0 is the home config — merge icon/scheme only
                homeSpaceConfig = harden({
                  ...HOME_SPACE_DEFAULTS,
                  icon: config.icon,
                  scheme: config.scheme,
                });
              } else {
                spacesMap.set(id, config);
              }
            }
          }),
        );
      }
      await Promise.all(loadPromises);
    } catch {
      // 'spaces' directory doesn't exist yet - that's fine
    }

    // Set active space based on current profile path
    syncActiveSpaceToPath();
    render();
  };

  /**
   * Get list of current spaces.
   *
   * @returns {SpaceConfig[]}
   */
  const getSpaces = () => getSpacesArray();

  /**
   * Get currently active space ID.
   *
   * @returns {string}
   */
  const getActiveSpaceId = () => activeSpaceId;

  /**
   * Handle keyboard shortcuts (Cmd+1..9).
   *
   * @param {KeyboardEvent} e
   */
  const handleKeydown = e => {
    // Check for Cmd+1 through Cmd+9 (or Ctrl on non-Mac)
    if (!e.metaKey && !e.ctrlKey) return;
    if (e.shiftKey || e.altKey) return;

    const key = e.key;
    const num = parseInt(key, 10);
    if (Number.isNaN(num) || num < 1 || num > 9) return;

    // 1-indexed: Cmd+1=home, Cmd+2=first user space, etc.
    const allSpaces = [homeSpaceConfig, ...getSpacesArray()];
    const index = num - 1;
    if (index < allSpaces.length) {
      e.preventDefault();
      selectSpace(allSpaces[index].id);
    }
  };

  // Set up keyboard listener
  document.addEventListener('keydown', handleKeydown);

  // Show shortcut badges when Command/Ctrl is held
  const handleModifierKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Meta' || e.key === 'Control') {
      $container.classList.add('show-shortcuts');
    }
  };
  const handleModifierKeyup = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Meta' || e.key === 'Control') {
      $container.classList.remove('show-shortcuts');
    }
  };
  // Also hide shortcuts when window loses focus
  const handleBlur = () => {
    $container.classList.remove('show-shortcuts');
  };
  document.addEventListener('keydown', handleModifierKeydown);
  document.addEventListener('keyup', handleModifierKeyup);
  window.addEventListener('blur', handleBlur);

  // Close context menu when clicking elsewhere or pressing Escape
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });

  // Initial render (empty)
  render();

  // Load spaces and start watching
  refresh()
    .then(() => watchSpaces())
    .catch(window.reportError);

  return harden({
    refresh,
    selectSpace,
    getSpaces,
    addSpace,
    updateSpace,
    removeSpace,
    getActiveSpaceId,
  });
};
harden(createSpacesGutter);
