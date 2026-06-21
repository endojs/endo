// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';

import {
  Fragment,
  h,
  renderConfined,
  unmount,
  useEffect,
  useState,
} from './setup-preact-container.js';

// TODO: The autocomplete dropdown menu may not appear visually inside the eval
// form modal despite the component working correctly (suggestions are fetched
// and filtered). Suspected z-index or overflow clipping: the menu gets the
// 'visible' class but does not display. This is a CSS concern unaffected by the
// confinement migration below.
//
// Pet-name path autocomplete, migrated from imperative `innerHTML`/
// `createElement` DOM to a confined Preact component rendered through a single
// `renderConfined`.
//
// CONFINEMENT BOUNDARY. `petNamePathAutocomplete` is trusted host code that owns
// the host `<input>` and the dropdown container `$menu` imperatively, OUTSIDE
// the Preact tree. The input's value, focus advancement, and the `.visible`
// class on `$menu` are host-DOM concerns (the input must keep focus; the caret
// is the host's). Only the dropdown body — the suggestion list and the keyboard
// hint — renders confined, into the host-provided `$menu`. The component
// receives only plain data (the suggestions and the selected index) and reports
// row hover/pick back through plain-data callbacks on a mutable controller.
//
// Keyboard navigation is driven off the host `<input>`'s own `keydown` (the menu
// is not focusable and the caret stays in the input). `$menu`'s position is
// CSS-driven, as in the original; the host only toggles its `.visible` class.
//
// The exported entry keeps its exact signature
// (`petNamePathAutocomplete($input, $menu, { E, powers })`) and hardened control
// object (`{ getValue, setValue, isMenuVisible, dispose }`) so callers
// (eval-form, endow-modal, form-builder, counter-proposal-form, inline-eval,
// inline-command-form) need no changes.

/**
 * @typedef {object} PetNamePathAutocompleteAPI
 * @property {() => string} getValue - Get the current path value
 * @property {(value: string) => void} setValue - Set the path value
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => void} dispose - Clean up event listeners
 */

/**
 * Plain-data view state pushed into the confined dropdown.
 *
 * @typedef {object} PathMenuState
 * @property {string[]} suggestions - The filtered suggestion list.
 * @property {number} selectedIndex - Index of the highlighted suggestion.
 */

/**
 * Mutable bridge between the host controller and the root component. The
 * component writes its state setter; the host writes the row callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} PathMenuController
 * @property {(s: PathMenuState | null) => void} [setState]
 * @property {PathMenuState | null} [pendingState] - Last state the host pushed,
 *   buffered so a render that happens before the Root's effect has wired
 *   `setState` is applied on mount instead of being silently dropped.
 * @property {(index: number) => void} [onHover]
 * @property {(index: number) => void} [onPick]
 */

/**
 * One suggestion row. Highlighted rows get the `selected` class; hovering
 * highlights it and clicking selects it (advancing focus). Event handlers
 * receive a frozen SafeEvent (no DOM nodes).
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
      onClick: e => {
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
 * @param {PathMenuState} props.state
 * @param {(index: number) => void} props.onHover
 * @param {(index: number) => void} props.onPick
 */
const PathMenu = ({ state, onHover, onPick }) => {
  const { suggestions, selectedIndex } = state;
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
    h(
      'div',
      { class: 'token-menu-hint' },
      h('kbd', null, '↑↓'),
      ' navigate · ',
      h('kbd', null, 'Tab'),
      ' select · ',
      h('kbd', null, '/'),
      ' drill down · ',
      h('kbd', null, 'Esc'),
      ' cancel',
    ),
  );
};
harden(PathMenu);

/**
 * Root component: owns the dropdown's view state and exposes its setter to the
 * host via a mutable controller. Renders nothing while hidden so the container
 * is empty, matching the original `innerHTML = ''` teardown.
 *
 * @param {object} props
 * @param {PathMenuController} props.controller
 */
const PathAutocompleteRoot = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {PathMenuState | null} */ (null),
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
    // Mount-only: `controller` is a stable per-instance bridge. Keying on it
    // re-runs this effect every render under confinement (the sanitizer
    // reissues the prop identity), and re-applying `setState(pendingState)`
    // — itself reissued — defeats Preact's Object.is bail into a slow
    // render/effect feedback loop that never settles on a slow runner.
  }, []);

  if (!state) {
    return null;
  }

  return h(PathMenu, {
    state,
    onHover: index => {
      if (controller.onHover) controller.onHover(index);
    },
    onPick: index => {
      if (controller.onPick) controller.onPick(index);
    },
  });
};
harden(PathAutocompleteRoot);

/**
 * Pet name path autocomplete component.
 * Autocompletes dot-delimited pet name paths like "foo.bar.baz".
 *
 * @param {HTMLInputElement} $input - The text input element
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object for listing names
 * @returns {PetNamePathAutocompleteAPI}
 */
export const petNamePathAutocomplete = ($input, $menu, { E, powers }) => {
  /** @type {string[]} */
  let suggestions = [];
  let selectedIndex = 0;
  let isVisible = false;

  // Mutable bridge to the root component's state setter (populated by the
  // component's effect). Intentionally NOT hardened — the component writes its
  // setter and the host writes the row callbacks onto it.
  /** @type {PathMenuController} */
  const controller = {};

  // Track deferred timers so `dispose` can cancel any that are still pending.
  // A timer that fires after teardown runs against a torn-down row, and the
  // uncancelled timers accumulate across a test file until the runner stalls.
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const pendingTimers = new Set();
  /**
   * @param {() => void} fn
   * @param {number} ms
   */
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      fn();
    }, ms);
    pendingTimers.add(id);
  };

  /**
   * Parse the input value into path prefix and current partial name.
   * @param {string} value
   * @returns {{ pathPrefix: string[], partial: string }}
   */
  const parseValue = value => {
    const parts = value.split('/');
    if (parts.length === 1) {
      return { pathPrefix: [], partial: parts[0] };
    }
    const partial = parts.pop() || '';
    return { pathPrefix: parts, partial };
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
        target = /** @type {{ lookup: (...path: string[]) => unknown }} */ (
          E(powers)
        ).lookup(...pathPrefix);
      }
      const namesP =
        /** @type {{ list: () => Promise<AsyncIterable<string>> }} */ (
          E(target)
        ).list();
      const names = await namesP;
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
    const state = harden({ suggestions: [...suggestions], selectedIndex });
    // Buffer the state so the Root's effect can apply it if it has not yet
    // wired `setState` (the effect flush is deferred through rAF).
    controller.pendingState = state;
    if (controller.setState) {
      controller.setState(state);
    }
  };

  /**
   * Find the next focusable element after the input.
   * @returns {HTMLElement | null}
   */
  const findNextFocusable = () => {
    const focusables = Array.from(
      document.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const currentIndex = focusables.indexOf($input);
    if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
      return /** @type {HTMLElement} */ (focusables[currentIndex + 1]);
    }
    return null;
  };

  /**
   * Select a suggestion and update the input.
   * @param {number} index
   * @param {boolean} [advanceFocus] - Whether to advance focus to next field
   */
  const selectSuggestion = (index, advanceFocus = false) => {
    if (index < 0 || index >= suggestions.length) return;

    const selected = suggestions[index];
    const { pathPrefix } = parseValue($input.value);

    // Build the new value with the selected name
    const newPath = [...pathPrefix, selected].join('/');
    $input.value = newPath;

    hideMenu();

    // Dispatch input event so parent knows value changed
    $input.dispatchEvent(new Event('input', { bubbles: true }));

    // Advance focus to next field if requested
    if (advanceFocus) {
      const nextElement = findNextFocusable();
      if (nextElement) {
        later(() => nextElement.focus(), 0);
      }
    }
  };

  /**
   * Update suggestions based on current input.
   */
  const updateSuggestions = async () => {
    const value = $input.value;
    const { pathPrefix, partial } = parseValue(value);

    const allNames = await fetchSuggestions(pathPrefix);

    // Only show autocomplete if user has typed at least one character
    // This allows empty values to be submitted (e.g., /list with no path)
    if (value.length === 0) {
      hideMenu();
      return;
    }

    // Filter by partial match (case-sensitive)
    suggestions = allNames.filter(name => name.startsWith(partial));

    if (suggestions.length > 0) {
      selectedIndex = 0;
      render();
      showMenu();
    } else if (partial) {
      // Show "no matches" only if user is typing something
      selectedIndex = 0;
      render();
      showMenu();
    } else {
      // Show all names when at a path boundary (e.g., "foo.")
      suggestions = allNames;
      if (suggestions.length > 0) {
        selectedIndex = 0;
        render();
        showMenu();
      } else {
        hideMenu();
      }
    }
  };

  // Row callbacks the confined tree invokes with plain-data indices.
  controller.onHover = index => {
    selectedIndex = index;
    render();
  };
  controller.onPick = index => {
    selectSuggestion(index, true);
  };

  // Handle input changes
  $input.addEventListener('input', () => {
    updateSuggestions();
  });

  // Handle focus to show suggestions
  $input.addEventListener('focus', () => {
    updateSuggestions();
  });

  // Handle blur to hide menu (with delay for click handling)
  $input.addEventListener('blur', () => {
    later(() => {
      hideMenu();
    }, 150);
  });

  // Handle keyboard navigation
  $input.addEventListener('keydown', e => {
    if (!isVisible) {
      // If menu not visible and user presses down, show it
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSuggestions();
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

      case 'Tab':
      case ' ':
        if (suggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex, true);
        }
        // If no suggestions, let Tab naturally advance focus
        break;

      case 'Enter':
        if (suggestions.length > 0) {
          e.preventDefault();
          selectSuggestion(selectedIndex);
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideMenu();
        break;

      case '/':
        // If there's an exact match selected, complete it first
        if (suggestions.length > 0) {
          const { partial } = parseValue($input.value);
          const exactMatch = suggestions.find(
            s => s.toLowerCase() === partial.toLowerCase(),
          );
          if (exactMatch) {
            // Let the slash be typed, then refresh
            later(() => updateSuggestions(), 0);
          }
        }
        break;

      default:
        break;
    }
  });

  // Mount the confined dropdown into the host's container. The host owns the
  // container's `.visible` class and lifecycle; the Preact tree renders only the
  // dropdown body. Rendered once; the Root renders nothing while hidden.
  renderConfined(h(PathAutocompleteRoot, { controller }), $menu);

  return harden({
    getValue: () => $input.value,
    setValue: value => {
      $input.value = value;
    },
    isMenuVisible: () => isVisible,
    dispose: () => {
      hideMenu();
      for (const id of pendingTimers) {
        clearTimeout(id);
      }
      pendingTimers.clear();
      // Tear down the confined dropdown tree mounted at the bottom of this
      // factory. Without this every torn-down row leaks a live Preact root.
      unmount($menu);
    },
  });
};
harden(petNamePathAutocomplete);
