// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

import { filterCommands, getCommandList } from './command-registry.js';

/**
 * @typedef {object} CommandSelectorAPI
 * @property {() => void} show - Show the command menu
 * @property {() => void} hide - Hide the command menu
 * @property {() => boolean} isVisible - Check if menu is visible
 * @property {(prefix: string) => void} filter - Filter commands by prefix
 * @property {() => void} selectNext - Move selection down
 * @property {() => void} selectPrev - Move selection up
 * @property {() => string | null} getSelected - Get currently selected command name
 * @property {() => void} confirmSelection - Confirm the current selection
 */

/**
 * Command selector component - shows a menu of available commands.
 *
 * @param {object} options
 * @param {HTMLElement} options.$menu - The menu container element
 * @param {(commandName: string) => void} options.onSelect - Called when a command is selected
 * @param {() => void} options.onCancel - Called when selection is cancelled
 * @returns {CommandSelectorAPI}
 */
export const commandSelectorComponent = ({ $menu, onSelect, onCancel }) => {
  let isVisible = false;
  let selectedIndex = 0;
  let currentFilter = '';
  /** @type {import('../state/command-registry.js').CommandDefinition[]} */
  let filteredCommands = [];

  const show = () => {
    isVisible = true;
    currentFilter = '';
    filteredCommands = getCommandList();
    selectedIndex = 0;
    render();
    $menu.classList.add('visible');
  };

  const hide = () => {
    isVisible = false;
    $menu.classList.remove('visible');
    currentFilter = '';
    selectedIndex = 0;
  };

  /**
   * Filter commands by prefix.
   * @param {string} prefix
   */
  const filter = prefix => {
    currentFilter = prefix;
    filteredCommands = filterCommands(prefix);
    if (selectedIndex >= filteredCommands.length) {
      selectedIndex = Math.max(0, filteredCommands.length - 1);
    }
    render();
  };

  const selectNext = () => {
    if (filteredCommands.length > 0) {
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
      render();
    }
  };

  const selectPrev = () => {
    if (filteredCommands.length > 0) {
      selectedIndex =
        (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
      render();
    }
  };

  const getSelected = () => {
    if (
      filteredCommands.length > 0 &&
      selectedIndex < filteredCommands.length
    ) {
      return filteredCommands[selectedIndex].name;
    }
    return null;
  };

  const confirmSelection = () => {
    const selected = getSelected();
    if (selected) {
      hide();
      onSelect(selected);
    }
  };

  const render = () => {
    $menu.innerHTML = '';

    if (filteredCommands.length === 0) {
      const $empty = document.createElement('div');
      $empty.className = 'token-menu-empty';
      $empty.textContent = currentFilter
        ? 'No matching commands'
        : 'No commands';
      $menu.appendChild($empty);
    } else {
      filteredCommands.forEach((cmd, index) => {
        const $item = document.createElement('div');
        $item.className = 'token-menu-item';
        if (index === selectedIndex) {
          $item.classList.add('selected');
        }

        const $prefix = document.createElement('span');
        $prefix.className = 'token-prefix';
        $prefix.textContent = '/';
        $item.appendChild($prefix);

        const $name = document.createElement('span');
        $name.textContent = cmd.name;
        $item.appendChild($name);

        const $desc = document.createElement('span');
        $desc.className = 'command-desc';
        $desc.textContent = ` - ${cmd.description}`;
        $item.appendChild($desc);

        $item.addEventListener('mouseenter', () => {
          selectedIndex = index;
          render();
        });

        $item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          selectedIndex = index;
          confirmSelection();
        });

        $menu.appendChild($item);
      });
    }

    const $hint = document.createElement('div');
    $hint.className = 'token-menu-hint';
    $hint.innerHTML =
      '<kbd>↑↓</kbd> navigate · <kbd>Tab</kbd>/<kbd>Enter</kbd> select · <kbd>Esc</kbd> cancel';
    $menu.appendChild($hint);
  };

  // Close menu on outside click
  document.addEventListener('click', e => {
    if (isVisible && !$menu.contains(/** @type {Node} */ (e.target))) {
      hide();
      onCancel();
    }
  });

  return {
    show,
    hide,
    isVisible: () => isVisible,
    filter,
    selectNext,
    selectPrev,
    getSelected,
    confirmSelection,
  };
};
