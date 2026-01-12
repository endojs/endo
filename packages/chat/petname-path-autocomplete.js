// @ts-check
/* global document, setTimeout */
/* eslint-disable no-use-before-define */

// TODO: The autocomplete dropdown menu is not appearing visually despite
// the component working correctly (suggestions are fetched and filtered).
// Suspected z-index or overflow clipping issue within the eval form modal.
// The menu element gets the 'visible' class but doesn't display.

/**
 * @typedef {object} PetNamePathAutocompleteAPI
 * @property {() => string} getValue - Get the current path value
 * @property {(value: string) => void} setValue - Set the path value
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => void} dispose - Clean up event listeners
 */

/**
 * Pet name path autocomplete component.
 * Autocompletes dot-delimited pet name paths like "foo.bar.baz".
 *
 * @param {HTMLInputElement} $input - The text input element
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {unknown} options.powers - Powers object for listing names
 * @returns {PetNamePathAutocompleteAPI}
 */
export const petNamePathAutocomplete = ($input, $menu, { E, powers }) => {
  /** @type {string[]} */
  let suggestions = [];
  let selectedIndex = 0;
  let isVisible = false;

  /**
   * Parse the input value into path prefix and current partial name.
   * @param {string} value
   * @returns {{ pathPrefix: string[], partial: string }}
   */
  const parseValue = value => {
    const parts = value.split('.');
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
      let target = powers;
      if (pathPrefix.length > 0) {
        target = E(powers).lookup(...pathPrefix);
      }
      const names = await E(target).list();
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
  };

  const render = () => {
    $menu.innerHTML = '';

    if (suggestions.length === 0) {
      const $empty = document.createElement('div');
      $empty.className = 'token-menu-empty';
      $empty.textContent = 'No matches';
      $menu.appendChild($empty);
    } else {
      suggestions.forEach((name, index) => {
        const $item = document.createElement('div');
        $item.className = 'token-menu-item';
        if (index === selectedIndex) {
          $item.classList.add('selected');
        }

        const $name = document.createElement('span');
        $name.textContent = name;
        $item.appendChild($name);

        $item.addEventListener('mouseenter', () => {
          selectedIndex = index;
          render();
        });

        $item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          selectSuggestion(index, true);
        });

        $menu.appendChild($item);
      });
    }

    const $hint = document.createElement('div');
    $hint.className = 'token-menu-hint';
    $hint.innerHTML = '<kbd>↑↓</kbd> navigate · <kbd>Tab</kbd> select · <kbd>.</kbd> drill down';
    $menu.appendChild($hint);
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
    const newPath = [...pathPrefix, selected].join('.');
    $input.value = newPath;

    hideMenu();

    // Dispatch input event so parent knows value changed
    $input.dispatchEvent(new Event('input', { bubbles: true }));

    // Advance focus to next field if requested
    if (advanceFocus) {
      const nextElement = findNextFocusable();
      if (nextElement) {
        setTimeout(() => nextElement.focus(), 0);
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
    setTimeout(() => {
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

      case '.':
        // If there's an exact match selected, complete it first
        if (suggestions.length > 0) {
          const { partial } = parseValue($input.value);
          const exactMatch = suggestions.find(
            s => s.toLowerCase() === partial.toLowerCase(),
          );
          if (exactMatch) {
            // Let the dot be typed, then refresh
            setTimeout(() => updateSuggestions(), 0);
          }
        }
        break;

      default:
        break;
    }
  });

  return {
    getValue: () => $input.value,
    setValue: value => {
      $input.value = value;
    },
    isMenuVisible: () => isVisible,
    dispose: () => {
      hideMenu();
    },
  };
};
