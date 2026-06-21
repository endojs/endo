// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Multi pet-name path autocomplete, migrated from imperative `innerHTML`/
// `createElement` DOM to a confined Preact component rendered through a single
// `renderConfined`.
//
// CONFINEMENT BOUNDARY. `petNamePathsAutocomplete` is trusted host code that
// owns the chip container, the host `<input>`, the chips themselves, and the
// dropdown container `$menu` imperatively, OUTSIDE the Preact tree. Chip
// creation/removal, the input's value, focus management, and the `.visible`
// class on `$menu` are host-DOM concerns (chips are interactive host widgets;
// the input must keep focus). Only the dropdown body — the suggestion list and
// the keyboard hint — renders confined, into the host-provided `$menu`. The
// component receives only plain data (the suggestions and the selected index)
// and reports row hover/pick back through plain-data callbacks on a mutable
// controller.
//
// Keyboard navigation is driven off the host `<input>`'s own `keydown` (the menu
// is not focusable and the caret stays in the input). `$menu`'s position is
// CSS-driven, as in the original; the host only toggles its `.visible` class.
// Rows report selection through `onMouseDown` (mirroring the original, which
// listened for `mousedown` to fire before the input's blur could hide the menu).
//
// The exported entry keeps its exact signature
// (`petNamePathsAutocomplete($container, $menu, { E, powers, onSubmit,
// onChange, finalizeOnSelect })`) and hardened control object
// (`{ getValue, setValue, isMenuVisible, dispose, focus }`) so callers
// (inline-command-form, add-space-modal) need no changes.

/**
 * @typedef {object} PetNamePathsAutocompleteAPI
 * @property {() => string[]} getValue - Get the current paths as array
 * @property {(paths: string[]) => void} setValue - Set the paths
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => void} dispose - Clean up event listeners
 * @property {() => void} focus - Focus the input element
 */

/**
 * Plain-data view state pushed into the confined dropdown.
 *
 * @typedef {object} PathsMenuState
 * @property {string[]} suggestions - The filtered suggestion list.
 * @property {number} selectedIndex - Index of the highlighted suggestion.
 * @property {boolean} finalizeOnSelect - Which keyboard hint to render.
 */

/**
 * Mutable bridge between the host controller and the root component. The
 * component writes its state setter; the host writes the row callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} PathsMenuController
 * @property {(s: PathsMenuState | null) => void} [setState]
 * @property {PathsMenuState | null} [pendingState] - Last state the host pushed,
 *   buffered so a render that happens before the Root's effect has wired
 *   `setState` is applied on mount instead of being silently dropped.
 * @property {(index: number) => void} [onHover]
 * @property {(index: number) => void} [onPick]
 */

/**
 * One suggestion row. Highlighted rows get the `selected` class; hovering
 * highlights it and pressing the mouse selects it (via `onMouseDown`, so the
 * pick fires before the input's blur can hide the menu). Event handlers receive
 * a frozen SafeEvent (no DOM nodes).
 *
 * @param {object} props
 * @param {string} props.name
 * @param {number} props.index
 * @param {boolean} props.selected
 * @param {(index: number) => void} props.onHover
 * @param {(index: number) => void} props.onPick
 */
const PathItem = ({ name, index, selected, onHover, onPick }) =>
  h(
    'div',
    {
      class: selected ? 'token-menu-item selected' : 'token-menu-item',
      onMouseEnter: () => onHover(index),
      /** @param {{ preventDefault: () => void, stopPropagation: () => void }} e */
      onMouseDown: e => {
        e.preventDefault();
        e.stopPropagation();
        onPick(index);
      },
    },
    h('span', null, name),
  );
harden(PathItem);

/**
 * The dropdown body: either the suggestion rows or a "No matches" empty state,
 * followed by the keyboard-hint footer. Pure view over plain-data state.
 *
 * @param {object} props
 * @param {PathsMenuState} props.state
 * @param {(index: number) => void} props.onHover
 * @param {(index: number) => void} props.onPick
 */
const PathsMenu = ({ state, onHover, onPick }) => {
  const { suggestions, selectedIndex, finalizeOnSelect } = state;
  return h(
    Fragment,
    null,
    suggestions.length === 0
      ? h('div', { class: 'token-menu-empty' }, 'No matches')
      : suggestions.map((name, index) =>
          h(PathItem, {
            key: name,
            name,
            index,
            selected: index === selectedIndex,
            onHover,
            onPick,
          }),
        ),
    // The keyboard-hint footer, rendered as real <kbd> vnodes (the confined
    // renderer strips dangerouslySetInnerHTML), reproducing the original markup.
    finalizeOnSelect
      ? h(
          'div',
          { class: 'token-menu-hint' },
          h('kbd', null, '↑↓'),
          ' navigate · ',
          h('kbd', null, '/'),
          ' drill down · ',
          h('kbd', null, '⇧Tab'),
          ' go back · ',
          h('kbd', null, 'Enter'),
          ' submit',
        )
      : h(
          'div',
          { class: 'token-menu-hint' },
          h('kbd', null, '↑↓'),
          ' navigate · ',
          h('kbd', null, '/'),
          ' drill down · ',
          h('kbd', null, 'Space'),
          ' add · ',
          h('kbd', null, 'Enter'),
          ' submit · ',
          h('kbd', null, 'Esc'),
          ' cancel',
        ),
  );
};
harden(PathsMenu);

/**
 * Root component: owns the dropdown's view state and exposes its setter to the
 * host via a mutable controller. Renders nothing while hidden so the container
 * is empty, matching the original `innerHTML = ''` teardown.
 *
 * @param {object} props
 * @param {PathsMenuController} props.controller
 */
const PathsAutocompleteRoot = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {PathsMenuState | null} */ (null),
  );

  useEffect(() => {
    controller.setState = setState;
    // Apply any state the host pushed before this effect wired `setState`,
    // so the first render is not silently dropped on slow flushes.
    if (controller.pendingState !== undefined) {
      setState(controller.pendingState);
    }
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
  }, [controller]);

  if (!state) {
    return null;
  }

  return h(PathsMenu, {
    state,
    onHover: index => {
      if (controller.onHover) controller.onHover(index);
    },
    onPick: index => {
      if (controller.onPick) controller.onPick(index);
    },
  });
};
harden(PathsAutocompleteRoot);

/**
 * Multi pet name path autocomplete component with chip UI.
 * Completed paths become chips, input field shows current partial path.
 * - "/" selects current suggestion, creates chip, continues drilling into it
 * - " " selects current suggestion, creates chip, starts fresh path
 * - Enter submits the form
 * - Backspace on empty input removes last chip
 *
 * @param {HTMLElement} $container - Container element (will be populated)
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object for listing names
 * @param {() => void} [options.onSubmit] - Called when Enter is pressed
 * @param {() => void} [options.onChange] - Called when value changes
 * @param {boolean} [options.finalizeOnSelect] - If true, selecting completes the chip without showing more suggestions. Use Shift+Tab to go back.
 * @returns {PetNamePathsAutocompleteAPI}
 */
export const petNamePathsAutocomplete = (
  $container,
  $menu,
  { E, powers, onSubmit, onChange, finalizeOnSelect = false },
) => {
  /** @type {string[]} */
  let completedPaths = [];
  /** @type {string[]} */
  let suggestions = [];
  let selectedIndex = 0;
  let isVisible = false;

  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter and the host writes the row callbacks onto it.
  /** @type {PathsMenuController} */
  const controller = {};

  // Create the chip container and input
  const $chipContainer = document.createElement('div');
  $chipContainer.className = 'chip-container';

  const $input = document.createElement('input');
  $input.type = 'text';
  $input.className = 'chip-input';
  $input.placeholder = '';
  $input.autocomplete = 'off';
  $input.dataset.formType = 'other';
  $input.dataset.lpignore = 'true';

  $chipContainer.appendChild($input);
  $container.appendChild($chipContainer);

  /**
   * Parse the current input into path prefix and partial.
   * @param {string} value
   * @returns {{ pathPrefix: string[], partial: string }}
   */
  const parseInput = value => {
    const parts = value.split('/');
    if (parts.length === 1) {
      return { pathPrefix: [], partial: parts[0] };
    }
    const partial = parts.pop() || '';
    return { pathPrefix: parts, partial };
  };

  /**
   * Create a chip element for a path.
   * @param {string} path
   * @param {number} index
   * @returns {HTMLElement}
   */
  const createChip = (path, index) => {
    const $chip = document.createElement('span');
    $chip.className = 'path-chip';
    $chip.dataset.index = String(index);

    const $text = document.createElement('span');
    $text.className = 'path-chip-text';
    $text.textContent = path;
    $chip.appendChild($text);

    const $remove = document.createElement('button');
    $remove.className = 'path-chip-remove';
    $remove.textContent = '×';
    $remove.type = 'button';
    $remove.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      removeChip(index);
    });
    $chip.appendChild($remove);

    return $chip;
  };

  /**
   * Remove a chip by index.
   * @param {number} index
   */
  const removeChip = index => {
    completedPaths.splice(index, 1);
    renderChips();
    notifyChange();
    $input.focus();
  };

  /**
   * Render all chips.
   */
  const renderChips = () => {
    // Remove existing chips (but keep input)
    const existingChips = $chipContainer.querySelectorAll('.path-chip');
    existingChips.forEach(chip => chip.remove());

    // Add chips before input
    completedPaths.forEach((path, index) => {
      const $chip = createChip(path, index);
      $chipContainer.insertBefore($chip, $input);
    });

    // Update placeholder
    $input.placeholder =
      completedPaths.length === 0 ? 'name or path/to/name' : '';
  };

  /**
   * Notify parent of value change.
   */
  const notifyChange = () => {
    if (onChange) {
      onChange();
    }
  };

  /**
   * Fetch suggestions for the given path prefix.
   * @param {string[]} pathPrefix
   * @returns {Promise<string[]>}
   */
  const fetchSuggestions = async pathPrefix => {
    try {
      /** @type {unknown} */
      let target = powers;
      if (pathPrefix.length > 0) {
        target =
          /** @type {{ lookup: (path: string | string[]) => unknown }} */ (
            E(powers)
          ).lookup(pathPrefix);
      }
      const names =
        await /** @type {{ list: () => Promise<AsyncIterable<string>> }} */ (
          E(target)
        ).list();
      const result = [];
      for await (const name of names) {
        result.push(name);
      }
      return result.sort();
    } catch {
      return [];
    }
  };

  const showMenu = () => {
    isVisible = true;
    $menu.classList.add('visible');
  };

  const hideMenu = () => {
    isVisible = false;
    $menu.classList.remove('visible');
    suggestions = [];
    selectedIndex = 0;
    controller.pendingState = null;
    if (controller.setState) {
      controller.setState(null);
    }
  };

  /**
   * Push the current suggestions/selection into the confined dropdown as plain
   * data. The host owns the container; only plain data crosses into the Preact
   * tree.
   */
  const render = () => {
    const state = harden({
      suggestions: [...suggestions],
      selectedIndex,
      finalizeOnSelect,
    });
    // Buffer the state so the Root's effect can apply it if it has not yet
    // wired `setState` (the effect flush is deferred through rAF).
    controller.pendingState = state;
    if (controller.setState) {
      controller.setState(state);
    }
  };

  /**
   * Select a suggestion.
   * @param {number} index
   * @param {'complete' | 'drilldown' | 'space'} mode
   *   - complete: just complete the name, stay in input
   *   - drilldown: complete and continue drilling (after "/")
   *   - space: complete, create chip, start new path
   */
  const selectSuggestion = (index, mode) => {
    if (index < 0 || index >= suggestions.length) return;

    const selected = suggestions[index];
    const { pathPrefix } = parseInput($input.value);

    // If input is empty and we have existing chips, extend the last chip's path
    const extendingLastChip =
      $input.value.length === 0 && completedPaths.length > 0;
    let fullPath;
    if (extendingLastChip) {
      const lastPath = completedPaths[completedPaths.length - 1];
      fullPath = `${lastPath}/${selected}`;
      // Remove the last chip since we're extending it
      completedPaths.pop();
    } else {
      fullPath = [...pathPrefix, selected].join('/');
    }

    if (mode === 'space') {
      // Create/update chip and clear input
      completedPaths.push(fullPath);
      $input.value = '';
      renderChips();
      notifyChange();
      hideMenu();
      // Show suggestions for the new/extended path (unless finalizeOnSelect)
      if (!finalizeOnSelect) {
        setTimeout(() => updateSuggestions(), 0);
      }
    } else if (mode === 'drilldown') {
      // Put full path in input with trailing slash for continued drilling
      $input.value = `${fullPath}/`;
      renderChips();
      notifyChange();
      // Fetch suggestions for the new prefix
      setTimeout(() => updateSuggestions(), 0);
    } else {
      // Just complete in the input
      $input.value = fullPath;
      notifyChange();
      hideMenu();
    }
  };

  /**
   * Update suggestions based on current input.
   */
  const updateSuggestions = async () => {
    const value = $input.value;
    const { pathPrefix, partial } = parseInput(value);

    if (value.length === 0) {
      // If there are completed paths, show suggestions for drilling into the last one
      // Otherwise show root suggestions
      let basePath = /** @type {string[]} */ ([]);
      if (completedPaths.length > 0) {
        const lastPath = completedPaths[completedPaths.length - 1];
        basePath = lastPath.split('/');
      }
      const allNames = await fetchSuggestions(basePath);
      suggestions = allNames;
      if (suggestions.length > 0) {
        selectedIndex = 0;
        render();
        showMenu();
      } else {
        hideMenu();
      }
      return;
    }

    const allNames = await fetchSuggestions(pathPrefix);

    // Filter by partial match
    if (partial.length > 0) {
      suggestions = allNames.filter(name => name.startsWith(partial));
    } else {
      // At a path boundary (ends with /), show all
      suggestions = allNames;
    }

    if (suggestions.length > 0) {
      selectedIndex = 0;
      render();
      showMenu();
    } else if (partial) {
      selectedIndex = 0;
      render();
      showMenu();
    } else {
      hideMenu();
    }
  };

  // Row callbacks the confined tree invokes with plain-data indices.
  controller.onHover = index => {
    selectedIndex = index;
    render();
  };
  controller.onPick = index => {
    selectSuggestion(index, 'space');
  };

  // Handle input changes
  $input.addEventListener('input', () => {
    notifyChange();
    updateSuggestions();
  });

  // Handle focus
  $input.addEventListener('focus', () => {
    updateSuggestions();
  });

  // Handle blur
  $input.addEventListener('blur', () => {
    setTimeout(() => {
      hideMenu();
    }, 150);
  });

  // Handle keyboard
  $input.addEventListener('keydown', e => {
    // Shift+Tab on empty input: go back to edit/extend the last chip
    if (
      e.key === 'Tab' &&
      e.shiftKey &&
      $input.value === '' &&
      completedPaths.length > 0
    ) {
      e.preventDefault();
      const lastPath = completedPaths.pop();
      // Put the path back in input with trailing slash for drilling
      $input.value = `${lastPath}/`;
      renderChips();
      notifyChange();
      // Show suggestions for extending
      updateSuggestions();
      return;
    }

    // Backspace on empty input removes last chip
    if (
      e.key === 'Backspace' &&
      $input.value === '' &&
      completedPaths.length > 0
    ) {
      e.preventDefault();
      completedPaths.pop();
      renderChips();
      notifyChange();
      return;
    }

    if (!isVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSuggestions();
      }
      if (e.key === 'Enter') {
        // Submit if we have paths or current input
        if (completedPaths.length > 0 || $input.value.trim()) {
          // Add current input as path if not empty
          if ($input.value.trim()) {
            completedPaths.push($input.value.trim());
            $input.value = '';
            renderChips();
            notifyChange();
          }
          if (onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex = (selectedIndex + 1) % suggestions.length;
          render();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + suggestions.length) % suggestions.length;
          render();
        }
        break;

      case 'Home':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex = 0;
          render();
        }
        break;

      case 'End':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex = suggestions.length - 1;
          render();
        }
        break;

      case 'PageDown':
        e.preventDefault();
        if (suggestions.length > 0) {
          const first = /** @type {HTMLElement | null} */ (
            $menu.querySelector('.token-menu-item')
          );
          const itemHeight = first ? first.offsetHeight : 32;
          const pageSize = Math.max(
            1,
            Math.floor($menu.clientHeight / itemHeight),
          );
          const step = Math.max(1, pageSize - 1);
          selectedIndex = Math.min(
            selectedIndex + step,
            suggestions.length - 1,
          );
          render();
        }
        break;

      case 'PageUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          const first = /** @type {HTMLElement | null} */ (
            $menu.querySelector('.token-menu-item')
          );
          const itemHeight = first ? first.offsetHeight : 32;
          const pageSize = Math.max(
            1,
            Math.floor($menu.clientHeight / itemHeight),
          );
          const step = Math.max(1, pageSize - 1);
          selectedIndex = Math.max(selectedIndex - step, 0);
          render();
        }
        break;

      case '/':
        // Select and drill down
        if (suggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex, 'drilldown');
        }
        break;

      case ' ':
        // Select and start new path
        if (suggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex, 'space');
        }
        break;

      case 'Tab':
        // Select and complete
        if (suggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex, 'complete');
        }
        break;

      case 'Enter':
        // Add current as chip and submit
        hideMenu();
        if ($input.value.trim()) {
          // If there's a selected suggestion, use it
          if (suggestions.length > 0) {
            const { pathPrefix } = parseInput($input.value);
            const fullPath = [...pathPrefix, suggestions[selectedIndex]].join(
              '/',
            );
            completedPaths.push(fullPath);
          } else {
            completedPaths.push($input.value.trim());
          }
          $input.value = '';
          renderChips();
          notifyChange();
        }
        if (onSubmit && completedPaths.length > 0) {
          e.preventDefault();
          onSubmit();
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideMenu();
        break;

      default:
        break;
    }
  });

  // Click on container focuses input
  $chipContainer.addEventListener('click', e => {
    if (e.target === $chipContainer) {
      $input.focus();
    }
  });

  // Initial render of host chips.
  renderChips();

  // Mount the confined dropdown into the host's container. The host owns the
  // container's `.visible` class and lifecycle; the Preact tree renders only the
  // dropdown body. Rendered once; the Root renders nothing while hidden.
  renderConfined(h(PathsAutocompleteRoot, { controller }), $menu);

  return harden({
    getValue: () => {
      // Include current input if not empty
      const current = $input.value.trim();
      return current ? [...completedPaths, current] : [...completedPaths];
    },
    setValue: paths => {
      completedPaths = [...paths];
      $input.value = '';
      renderChips();
    },
    isMenuVisible: () => isVisible,
    dispose: () => {
      hideMenu();
    },
    // Expose input for focus management
    focus: () => $input.focus(),
  });
};
harden(petNamePathsAutocomplete);
