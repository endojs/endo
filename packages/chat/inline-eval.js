// @ts-check
/* global document, setTimeout */
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

/**
 * @typedef {object} ParsedEval
 * @property {string} source - The JavaScript source code
 * @property {Array<{codeName: string, petName: string}>} endowments - Parsed endowments
 * @property {number} [cursorPosition] - Cursor position in source (0-indexed character offset)
 */

/**
 * @typedef {object} InlineEvalAPI
 * @property {() => ParsedEval} getData - Get parsed eval data
 * @property {() => boolean} isValid - Check if eval is valid
 * @property {(disabled: boolean) => void} setDisabled - Disable or enable all fields
 * @property {() => void} clear - Clear the input
 * @property {() => void} focus - Focus the input
 * @property {(data: ParsedEval) => void} setData - Set data (for expansion from modal)
 * @property {() => void} dispose - Clean up
 */

/**
 * @typedef {object} EndowmentField
 * @property {HTMLElement} $container
 * @property {HTMLInputElement} $petName
 * @property {HTMLInputElement} $codeName
 * @property {() => void} dispose
 */

/**
 * Convert a pet name to a valid JavaScript identifier.
 * - Takes the last segment of a dot-path
 * - Converts kebab-case to camelCase
 * - Removes invalid characters
 *
 * @param {string} petName
 * @returns {string}
 */
const toJsIdentifier = petName => {
  // Get last segment of path
  const parts = petName.split('.');
  let name = parts[parts.length - 1] || '';

  // Convert kebab-case to camelCase
  name = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  // Remove leading digits and invalid chars
  name = name.replace(/^[0-9]+/, '').replace(/[^a-zA-Z0-9_$]/g, '');

  return name;
};

/**
 * Create an inline eval input component with structured endowment fields.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container for the input
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object for autocomplete
 * @param {(data: ParsedEval) => void} options.onSubmit - Called on Enter
 * @param {(data: ParsedEval) => void} options.onExpand - Called on Cmd+Enter to expand to modal
 * @param {() => void} options.onCancel - Called on Escape
 * @param {(isValid: boolean) => void} options.onValidityChange - Called when validity changes
 * @returns {InlineEvalAPI}
 */
export const createInlineEval = ({
  $container,
  E,
  powers,
  onSubmit,
  onExpand,
  onCancel,
  onValidityChange,
}) => {
  // Create structure with endowments container and source input
  $container.innerHTML = `
    <div class="inline-eval-wrapper">
      <div class="inline-eval-endowments"></div>
      <input type="text" class="inline-eval-input" placeholder="expression..." />
    </div>
  `;

  const $endowmentsContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.inline-eval-endowments')
  );
  const $source = /** @type {HTMLInputElement} */ (
    $container.querySelector('.inline-eval-input')
  );

  /** @type {EndowmentField[]} */
  const endowmentFields = [];

  /**
   * Create a new endowment field with both petName and codeName always visible.
   * @param {string} [initialPetName] - Initial pet name value
   * @param {string} [initialCodeName] - Initial code name value
   * @returns {EndowmentField}
   */
  const createEndowmentField = (initialPetName = '', initialCodeName = '') => {
    const $field = document.createElement('div');
    $field.className = 'inline-eval-endowment-group';

    // Pet name chip (styled as token)
    const $chip = document.createElement('div');
    $chip.className = 'inline-eval-chip';

    // Pet name input
    const $petName = document.createElement('input');
    $petName.type = 'text';
    $petName.className = 'inline-eval-petname';
    $petName.placeholder = 'petName';
    $petName.value = initialPetName;
    $petName.autocomplete = 'off';
    $petName.dataset.formType = 'other';
    $petName.dataset.lpignore = 'true';

    // Sizer for petName
    const $petNameSizer = document.createElement('span');
    $petNameSizer.className = 'inline-eval-sizer inline-eval-sizer-petname';
    $petNameSizer.textContent = initialPetName || 'petName';

    const resizePetName = () => {
      $petNameSizer.textContent = $petName.value || $petName.placeholder;
      $petName.style.width = `${$petNameSizer.offsetWidth + 4}px`;
    };

    // Pet name wrapper (for autocomplete menu positioning)
    const $petNameWrapper = document.createElement('div');
    $petNameWrapper.className = 'inline-eval-petname-wrapper';
    $petNameWrapper.appendChild($petName);
    $petNameWrapper.appendChild($petNameSizer);

    // Autocomplete menu
    const $petNameMenu = document.createElement('div');
    $petNameMenu.className = 'inline-petname-menu';
    $petNameWrapper.appendChild($petNameMenu);

    // Add petname wrapper to chip
    $chip.appendChild($petNameWrapper);

    // Arrow separator (outside chip)
    const $eq = document.createElement('span');
    $eq.className = 'inline-eval-arrow';
    $eq.textContent = '→';

    // Code name input (outside chip)
    const $codeName = document.createElement('input');
    $codeName.type = 'text';
    $codeName.className = 'inline-eval-codename';
    $codeName.placeholder = 'varName';
    $codeName.value = initialCodeName || toJsIdentifier(initialPetName);
    $codeName.autocomplete = 'off';
    $codeName.dataset.formType = 'other';
    $codeName.dataset.lpignore = 'true';

    // Sizer for codeName
    const $codeNameSizer = document.createElement('span');
    $codeNameSizer.className = 'inline-eval-sizer inline-eval-sizer-codename';

    const resizeCodeName = () => {
      $codeNameSizer.textContent = $codeName.value || $codeName.placeholder;
      $codeName.style.width = `${$codeNameSizer.offsetWidth + 4}px`;
    };

    // Code name wrapper
    const $codeNameWrapper = document.createElement('div');
    $codeNameWrapper.className = 'inline-eval-codename-wrapper';
    $codeNameWrapper.appendChild($codeName);
    $codeNameWrapper.appendChild($codeNameSizer);

    // Assemble the field: [chip] → codeName
    $field.appendChild($chip);
    $field.appendChild($eq);
    $field.appendChild($codeNameWrapper);

    // Initialize autocomplete for pet name
    const autocomplete = petNamePathAutocomplete($petName, $petNameMenu, {
      E,
      powers,
    });

    // Auto-update codeName when petName changes
    $petName.addEventListener('input', () => {
      resizePetName();
      // Update codeName with inferred identifier
      $codeName.value = toJsIdentifier($petName.value);
      resizeCodeName();
      updateValidity(); // eslint-disable-line no-use-before-define
    });

    // Handle keydown in pet name field
    $petName.addEventListener('keydown', e => {
      // = advances to codeName field
      if (e.key === '=') {
        e.preventDefault();
        $codeName.focus();
        $codeName.select();
        return;
      }

      // Let autocomplete handle keys when menu is visible
      if (autocomplete.isMenuVisible()) {
        return;
      }

      if (e.key === 'Tab' || e.key === ' ') {
        // Skip past codeName to source
        e.preventDefault();
        $source.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onExpand(getData(true)); // eslint-disable-line no-use-before-define
        } else if (isValid()) {
          // eslint-disable-line no-use-before-define
          e.preventDefault();
          onSubmit(getData()); // eslint-disable-line no-use-before-define
        }
      } else if (e.key === 'Backspace' && $petName.value === '') {
        // Backspace on empty petName - remove this endowment
        e.preventDefault();
        removeEndowmentField(field); // eslint-disable-line no-use-before-define
        const idx = endowmentFields.indexOf(field); // eslint-disable-line no-use-before-define
        if (idx > 0) {
          endowmentFields[idx - 1].$codeName.focus();
        } else {
          $source.focus();
        }
      }
    });

    // Handle keydown in code name field
    $codeName.addEventListener('keydown', e => {
      if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        $source.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onExpand(getData(true)); // eslint-disable-line no-use-before-define
        } else if (isValid()) {
          // eslint-disable-line no-use-before-define
          e.preventDefault();
          onSubmit(getData()); // eslint-disable-line no-use-before-define
        }
      } else if (e.key === 'Backspace' && $codeName.value === '') {
        // Backspace on empty codeName - go back to petName
        e.preventDefault();
        $petName.focus();
      }
    });

    $codeName.addEventListener('input', () => {
      resizeCodeName();
      updateValidity(); // eslint-disable-line no-use-before-define
    });

    // Initial sizing
    setTimeout(() => {
      resizePetName();
      resizeCodeName();
    }, 0);

    const field = {
      $container: $field,
      $petName,
      $codeName,
      dispose: () => {
        autocomplete.dispose();
      },
    };

    return field;
  };

  /**
   * Add a new endowment field.
   * @param {string} [petName]
   * @param {string} [codeName]
   * @returns {EndowmentField}
   */
  const addEndowmentField = (petName = '', codeName = '') => {
    const field = createEndowmentField(petName, codeName);
    endowmentFields.push(field);
    $endowmentsContainer.appendChild(field.$container);
    return field;
  };

  /**
   * Remove an endowment field.
   * @param {EndowmentField} field
   */
  const removeEndowmentField = field => {
    const idx = endowmentFields.indexOf(field);
    if (idx >= 0) {
      field.dispose();
      field.$container.remove();
      endowmentFields.splice(idx, 1);
      updateValidity();
    }
  };

  /**
   * Get parsed data from all fields.
   * @param {boolean} [includeCursor] - Include cursor position
   * @returns {ParsedEval}
   */
  const getData = (includeCursor = false) => {
    const endowments = endowmentFields
      .filter(f => f.$petName.value.trim())
      .map(f => ({
        petName: f.$petName.value.trim(),
        codeName:
          f.$codeName.value.trim() || toJsIdentifier(f.$petName.value.trim()),
      }));

    /** @type {ParsedEval} */
    const result = {
      source: $source.value.trim(),
      endowments,
    };

    if (includeCursor) {
      result.cursorPosition = $source.selectionStart ?? 0;
    }

    return result;
  };

  /**
   * Check if valid (has at least some source code).
   * @returns {boolean}
   */
  const isValid = () => {
    const { source } = getData();
    return source.length > 0;
  };

  const updateValidity = () => {
    onValidityChange(isValid());
  };

  // Handle @ at start of source to create endowment
  $source.addEventListener('input', () => {
    if ($source.value.startsWith('@')) {
      // Remove the @ and create a new endowment field
      $source.value = $source.value.slice(1);
      const field = addEndowmentField();
      field.$petName.focus();
    }
    updateValidity();
  });

  $source.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        onExpand(getData(true));
      } else if (!e.shiftKey && isValid()) {
        e.preventDefault();
        onSubmit(getData());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (
      e.key === 'Backspace' &&
      $source.value === '' &&
      $source.selectionStart === 0
    ) {
      // Backspace at start of empty source - delete last endowment or cancel
      if (endowmentFields.length > 0) {
        e.preventDefault();
        const last = endowmentFields[endowmentFields.length - 1];
        removeEndowmentField(last);
        // Focus previous endowment or stay in source
        if (endowmentFields.length > 0) {
          endowmentFields[endowmentFields.length - 1].$codeName.focus();
        }
      } else {
        // No endowments - cancel command mode
        e.preventDefault();
        onCancel();
      }
    }
  });

  /**
   * Clear all fields.
   */
  const clear = () => {
    for (const field of endowmentFields) {
      field.dispose();
      field.$container.remove();
    }
    endowmentFields.length = 0;
    $source.value = '';
    updateValidity();
  };

  /**
   * Focus the source input (or first endowment if present).
   */
  const focus = () => {
    if (endowmentFields.length > 0) {
      endowmentFields[0].$petName.focus();
    } else {
      $source.focus();
    }
  };

  /**
   * Set data from modal or history.
   * @param {ParsedEval} data
   */
  const setData = data => {
    clear();
    for (const e of data.endowments) {
      addEndowmentField(e.petName, e.codeName);
    }
    $source.value = data.source;
    updateValidity();
  };

  /**
   * Disable or enable all fields.
   * @param {boolean} disabled
   */
  const setDisabled = disabled => {
    $source.disabled = disabled;
    for (const field of endowmentFields) {
      field.$petName.disabled = disabled;
      field.$codeName.disabled = disabled;
    }
  };

  /**
   * Clean up.
   */
  const dispose = () => {
    for (const field of endowmentFields) {
      field.dispose();
    }
    endowmentFields.length = 0;
    $container.innerHTML = '';
  };

  // Initial validity
  updateValidity();

  return {
    getData,
    isValid,
    setDisabled,
    clear,
    focus,
    setData,
    dispose,
  };
};
