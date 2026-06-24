// @ts-check

import harden from '@endo/harden';

import { filterCommands } from './command-registry.js';
import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Command selector, migrated from imperative `innerHTML`/`createElement` DOM to
// a confined Preact component rendered through a single `renderConfined`. The
// exported entry, `commandSelectorComponent({...})`, keeps its exact options
// shape and the same hardened control object (`show`/`hide`/`isVisible`/
// `filter`/`selectNext`/… ) so the caller (chat-bar-component.js) needs no
// changes.
//
// `commandSelectorComponent` is trusted host code. It keeps the external
// `$menu` container element in closure and orchestrates it imperatively
// OUTSIDE the Preact tree: it toggles the `.visible` class, installs the
// document-level outside-click listener, measures the container geometry for
// Page Up/Down paging, and scrolls the highlighted row into view after each
// render. NONE of these DOM nodes are ever passed into a confined vnode; only
// plain data (the filtered command list, the selected index, the empty-state
// label) crosses into the Preact tree. The host text input is never handed in
// either — the caller passes the current query string through `filter(prefix)`.
//
// Visual state (the filtered command list and the highlighted index) lives in
// Preact state held by a small Root component; the host's methods drive a
// mutable controller the Root wires to its setter via `useEffect`, mirroring
// the channel-list and profile-popup migrations. The same `.token-menu-*` /
// `.command-desc` CSS classes are reused so index.css styling continues to
// apply and the menu looks identical.

/**
 * @typedef {object} CommandSelectorAPI
 * @property {() => void} show - Show the command menu
 * @property {() => void} hide - Hide the command menu
 * @property {() => boolean} isVisible - Check if menu is visible
 * @property {(prefix: string) => void} filter - Filter commands by prefix
 * @property {() => void} selectNext - Move selection down
 * @property {() => void} selectPrev - Move selection up
 * @property {() => void} selectFirst - Move selection to first item (Home)
 * @property {() => void} selectLast - Move selection to last item (End)
 * @property {() => void} selectPageDown - Move selection down one page
 * @property {() => void} selectPageUp - Move selection up one page
 * @property {() => string | null} getSelected - Get currently selected command name
 * @property {() => void} confirmSelection - Confirm the current selection
 */

/**
 * @typedef {import('./command-registry.js').CommandDefinition} CommandDefinition
 */

/**
 * @typedef {object} CommandMenuState
 * @property {CommandDefinition[]} commands - The filtered command list
 * @property {number} selectedIndex - Index of the highlighted command
 * @property {boolean} hasFilter - Whether a non-empty filter is active
 */

/**
 * Mutable bridge between the host control object and the root component. The
 * component writes its state setter; the host writes the row callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} CommandSelectorController
 * @property {(s: CommandMenuState | null) => void} [setState]
 * @property {(index: number) => void} [onHover]
 * @property {(index: number) => void} [onPick]
 */

/**
 * One command row. Highlighted rows get the `selected` class; hovering a row
 * highlights it and clicking it confirms the selection. Event handlers receive
 * a frozen SafeEvent (no DOM nodes); the row reports its own index back to the
 * host via plain-data callbacks.
 *
 * @param {object} props
 * @param {CommandDefinition} props.command
 * @param {number} props.index
 * @param {boolean} props.selected
 * @param {(index: number) => void} props.onHover
 * @param {(index: number) => void} props.onPick
 */
const CommandItem = ({ command, index, selected, onHover, onPick }) =>
  h(
    'div',
    {
      class: selected ? 'token-menu-item selected' : 'token-menu-item',
      onMouseEnter: () => onHover(index),
      /** @param {{ preventDefault: () => void, stopPropagation: () => void }} e */
      onClick: e => {
        e.preventDefault();
        e.stopPropagation();
        onPick(index);
      },
    },
    h('span', { class: 'token-prefix' }, '/'),
    h('span', null, command.name),
    h('span', { class: 'command-desc' }, ` - ${command.description}`),
  );
harden(CommandItem);

/**
 * The dropdown body: either the command rows or an empty-state message,
 * followed by the keyboard-hint footer. Pure view over plain-data state.
 *
 * @param {object} props
 * @param {CommandMenuState} props.state
 * @param {(index: number) => void} props.onHover
 * @param {(index: number) => void} props.onPick
 */
const CommandMenu = ({ state, onHover, onPick }) => {
  const { commands, selectedIndex, hasFilter } = state;
  return h(
    Fragment,
    null,
    commands.length === 0
      ? h(
          'div',
          { class: 'token-menu-empty' },
          hasFilter ? 'No matching commands' : 'No commands',
        )
      : commands.map((command, index) =>
          h(CommandItem, {
            key: command.name,
            command,
            index,
            selected: index === selectedIndex,
            onHover,
            onPick,
          }),
        ),
    // The keyboard-hint footer, rendered as real <kbd> vnodes (the confined
    // renderer strips dangerouslySetInnerHTML), reproducing the original
    // markup: "↑↓ navigate · Tab/Enter select · Esc cancel".
    h(
      'div',
      { class: 'token-menu-hint' },
      h('kbd', null, '↑↓'),
      ' navigate · ',
      h('kbd', null, 'Tab'),
      '/',
      h('kbd', null, 'Enter'),
      ' select · ',
      h('kbd', null, 'Esc'),
      ' cancel',
    ),
  );
};
harden(CommandMenu);

/**
 * Root component: owns the menu's view state (the filtered command list and the
 * highlighted index) and exposes its setter to the host via a mutable
 * controller. Renders nothing while hidden so the container is empty, matching
 * the original `innerHTML = ''` teardown.
 *
 * @param {object} props
 * @param {CommandSelectorController} props.controller
 */
const CommandSelectorRoot = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {CommandMenuState | null} */ (null),
  );

  useEffect(() => {
    controller.setState = setState;
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
  }, [controller]);

  if (!state) {
    return null;
  }

  return h(CommandMenu, {
    state,
    onHover: index => {
      if (controller.onHover) controller.onHover(index);
    },
    onPick: index => {
      if (controller.onPick) controller.onPick(index);
    },
  });
};
harden(CommandSelectorRoot);

/**
 * Command selector component - shows a menu of available commands.
 *
 * @param {object} options
 * @param {HTMLElement} options.$menu - The menu container element
 * @param {(commandName: string) => void} options.onSelect - Called when a command is selected
 * @param {() => void} options.onCancel - Called when selection is cancelled
 * @param {() => 'inbox' | 'channel' | undefined} [options.getContext] - Returns the current UI context
 * @returns {CommandSelectorAPI}
 */
export const commandSelectorComponent = ({
  $menu,
  onSelect,
  onCancel,
  getContext,
}) => {
  let isVisible = false;
  let selectedIndex = 0;
  let currentFilter = '';
  /** @type {CommandDefinition[]} */
  let filteredCommands = [];

  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter and the host writes the row callbacks onto it.
  /** @type {CommandSelectorController} */
  const controller = {};

  /**
   * Push the current selection state into the Preact tree and, after the tree
   * has rendered, scroll the highlighted row into view. The scroll-into-view
   * query reads the host's own container — a trusted, imperative operation
   * outside the vnode tree; no DOM node is ever handed to a confined vnode.
   */
  const render = () => {
    if (controller.setState) {
      controller.setState(
        harden({
          commands: filteredCommands,
          selectedIndex,
          hasFilter: currentFilter !== '',
        }),
      );
    }
    // Keep the selected item in view when navigating with arrow keys. Preact
    // flushes the render synchronously here, but guard with optional chaining
    // in case the row is not yet present.
    const $selected = $menu.querySelector('.token-menu-item.selected');
    if ($selected) {
      $selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  };

  const show = () => {
    isVisible = true;
    currentFilter = '';
    const context = getContext ? getContext() : undefined;
    filteredCommands = filterCommands('', context);
    selectedIndex = 0;
    render();
    $menu.classList.add('visible');
  };

  const hide = () => {
    isVisible = false;
    $menu.classList.remove('visible');
    currentFilter = '';
    selectedIndex = 0;
    if (controller.setState) {
      controller.setState(null);
    }
  };

  /**
   * Filter commands by prefix.
   * @param {string} prefix
   */
  const filter = prefix => {
    currentFilter = prefix;
    const context = getContext ? getContext() : undefined;
    filteredCommands = filterCommands(prefix, context);
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

  const selectFirst = () => {
    if (filteredCommands.length > 0) {
      selectedIndex = 0;
      render();
    }
  };

  const selectLast = () => {
    if (filteredCommands.length > 0) {
      selectedIndex = filteredCommands.length - 1;
      render();
    }
  };

  /**
   * Step size for Page Down/Up: one less than visible rows so the user sees
   * motion. Reads the host's own container geometry imperatively (trusted,
   * outside the vnode tree).
   * @returns {number}
   */
  const getPageStep = () => {
    const first = /** @type {HTMLElement | null} */ (
      $menu.querySelector('.token-menu-item')
    );
    if (!first) return 1;
    const itemHeight = first.offsetHeight;
    const viewHeight = $menu.clientHeight;
    const pageSize = Math.max(1, Math.floor(viewHeight / itemHeight));
    return Math.max(1, pageSize - 1);
  };

  const selectPageDown = () => {
    if (filteredCommands.length > 0) {
      const step = getPageStep();
      selectedIndex = Math.min(
        selectedIndex + step,
        filteredCommands.length - 1,
      );
      render();
    }
  };

  const selectPageUp = () => {
    if (filteredCommands.length > 0) {
      const step = getPageStep();
      selectedIndex = Math.max(selectedIndex - step, 0);
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

  // Row callbacks the confined tree invokes with plain-data indices.
  controller.onHover = index => {
    selectedIndex = index;
    render();
  };
  controller.onPick = index => {
    selectedIndex = index;
    confirmSelection();
  };

  // Mount the confined menu into the host's container. The host owns the
  // container's `.visible` class and lifecycle; the Preact tree renders only
  // the dropdown body.
  renderConfined(h(CommandSelectorRoot, { controller }), $menu);

  // Close menu on outside click. Trusted host-level listener that reads the
  // host's own container; never crosses into the confined tree.
  document.addEventListener('click', e => {
    if (isVisible && !$menu.contains(/** @type {Node} */ (e.target))) {
      hide();
      onCancel();
    }
  });

  return harden({
    show,
    hide,
    isVisible: () => isVisible,
    filter,
    selectNext,
    selectPrev,
    selectFirst,
    selectLast,
    selectPageDown,
    selectPageUp,
    getSelected,
    confirmSelection,
  });
};
harden(commandSelectorComponent);
