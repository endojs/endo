// @ts-check
/* global document, setTimeout */
/* eslint-disable no-use-before-define */

/**
 * @typedef {object} PetNamePathsAutocompleteAPI
 * @property {() => string[]} getValue - Get the current paths as array
 * @property {(paths: string[]) => void} setValue - Set the paths
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => void} dispose - Clean up event listeners
 */

/**
 * Multi pet name path autocomplete component with chip UI.
 * Completed paths become chips, input field shows current partial path.
 * - "." selects current suggestion, creates chip, continues drilling into it
 * - " " selects current suggestion, creates chip, starts fresh path
 * - Enter submits the form
 * - Backspace on empty input removes last chip
 *
 * @param {HTMLElement} $container - Container element (will be populated)
 * @param {HTMLElement} $menu - The autocomplete menu container
 * @param {object} options
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {unknown} options.powers - Powers object for listing names
 * @param {() => void} [options.onSubmit] - Called when Enter is pressed
 * @param {() => void} [options.onChange] - Called when value changes
 * @returns {PetNamePathsAutocompleteAPI}
 */
export const petNamePathsAutocomplete = (
  $container,
  $menu,
  { E, powers, onSubmit, onChange },
) => {
  /** @type {string[]} */
  let completedPaths = [];
  /** @type {string[]} */
  let suggestions = [];
  let selectedIndex = 0;
  let isVisible = false;

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
    const parts = value.split('.');
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
      completedPaths.length === 0 ? 'name or path.to.name' : '';
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

  const renderMenu = () => {
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
          renderMenu();
        });

        $item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          selectSuggestion(index, 'complete');
        });

        $menu.appendChild($item);
      });
    }

    const $hint = document.createElement('div');
    $hint.className = 'token-menu-hint';
    $hint.innerHTML =
      '<kbd>↑↓</kbd> navigate · <kbd>.</kbd> drill down · <kbd>Space</kbd> add · <kbd>Enter</kbd> submit';
    $menu.appendChild($hint);
  };

  /**
   * Select a suggestion.
   * @param {number} index
   * @param {'complete' | 'drilldown' | 'space'} mode
   *   - complete: just complete the name, stay in input
   *   - drilldown: complete and continue drilling (after ".")
   *   - space: complete, create chip, start new path
   */
  const selectSuggestion = (index, mode) => {
    if (index < 0 || index >= suggestions.length) return;

    const selected = suggestions[index];
    const { pathPrefix } = parseInput($input.value);

    // Build the full path for this selection
    const fullPath = [...pathPrefix, selected].join('.');

    if (mode === 'space') {
      // Create chip and clear input
      completedPaths.push(fullPath);
      $input.value = '';
      renderChips();
      notifyChange();
      hideMenu();
      // Show suggestions for new path
      setTimeout(() => updateSuggestions(), 0);
    } else if (mode === 'drilldown') {
      // Create chip for current path, start drilling into it
      completedPaths.push(fullPath);
      $input.value = fullPath + '.';
      // Remove the chip we just added - we're continuing to edit it
      completedPaths.pop();
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
      // Show root suggestions when empty
      const allNames = await fetchSuggestions([]);
      suggestions = allNames;
      if (suggestions.length > 0) {
        selectedIndex = 0;
        renderMenu();
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
      // At a path boundary (ends with .), show all
      suggestions = allNames;
    }

    if (suggestions.length > 0) {
      selectedIndex = 0;
      renderMenu();
      showMenu();
    } else if (partial) {
      selectedIndex = 0;
      renderMenu();
      showMenu();
    } else {
      hideMenu();
    }
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
          renderMenu();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          selectedIndex =
            (selectedIndex - 1 + suggestions.length) % suggestions.length;
          renderMenu();
        }
        break;

      case '.':
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
              '.',
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

  // Initial render
  renderChips();

  return {
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
  };
};
