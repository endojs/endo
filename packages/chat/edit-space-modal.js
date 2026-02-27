// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

/** @import { ColorScheme, SpaceConfig } from './spaces-gutter.js' */
/** @import { SchemePickerAPI } from './scheme-picker.js' */

import { createSchemePicker } from './scheme-picker.js';

/**
 * @typedef {object} EditSpaceModalAPI
 * @property {(space: SpaceConfig) => void} show - Show the modal for editing a space
 * @property {() => void} hide - Hide the modal
 * @property {() => boolean} isVisible - Check if modal is visible
 */

/**
 * @typedef {object} EditSpaceFormData
 * @property {string} name - Display name for the space
 * @property {string} icon - Emoji or letter icon
 * @property {ColorScheme} scheme - Color scheme preference
 */

/** Favored emoji icons grouped by category */
const ICON_CATEGORIES = harden({
  characters: ['🧙', '🧝', '🧌', '🦸', '🥷', '🧑‍💼'],
  masks: ['👺', '👹', '🎭', '🤿'],
  fae: ['🧚'],
  djinn: ['🧞'],
  bots: ['🤖', '🦾'],
  cats: ['🐈‍⬛', '🐈'],
  etc: ['💬', '🎮', '📡'],
});
harden(ICON_CATEGORIES);

const ALL_ICONS = harden([
  ...ICON_CATEGORIES.characters,
  ...ICON_CATEGORIES.masks,
  ...ICON_CATEGORIES.fae,
  ...ICON_CATEGORIES.djinn,
  ...ICON_CATEGORIES.bots,
  ...ICON_CATEGORIES.cats,
  ...ICON_CATEGORIES.etc,
]);
harden(ALL_ICONS);

/**
 * Generate a letter-based icon (circled letter).
 *
 * @param {string} letters - One or two letters
 * @returns {string}
 */
const letterIcon = letters => {
  return letters.slice(0, 2).toUpperCase();
};

/**
 * Create the edit space modal component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {(id: string, data: EditSpaceFormData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when modal is closed
 * @returns {EditSpaceModalAPI}
 */
export const createEditSpaceModal = ({ $container, onSubmit, onClose }) => {
  let visible = false;
  /** @type {SpaceConfig | null} */
  let editingSpace = null;
  let selectedIcon = '🐈‍⬛';
  let useLetterIcon = false;
  /** @type {string} */
  let spaceName = '';
  /** @type {string | null} */
  let error = null;
  /** @type {boolean} */
  let isSubmitting = false;

  /** @type {SchemePickerAPI | null} */
  let schemePicker = null;

  /**
   * Render the icon selector HTML.
   * @returns {string}
   */
  const renderIconSelector = () => {
    const iconGrid = ALL_ICONS.map(
      icon => `
      <button type="button" class="icon-option ${icon === selectedIcon && !useLetterIcon ? 'selected' : ''}"
              data-icon="${icon}">${icon}</button>
    `,
    ).join('');

    return `
      <div class="add-space-field">
        <label>Icon</label>
        <div class="icon-selector">
          <div class="icon-tabs">
            <button type="button" class="icon-tab ${!useLetterIcon ? 'active' : ''}" data-tab="emoji">Emoji</button>
            <button type="button" class="icon-tab ${useLetterIcon ? 'active' : ''}" data-tab="letter">Letter</button>
          </div>
          <div class="icon-content">
            ${
              useLetterIcon
                ? `
              <div class="letter-icon-input">
                <input type="text" id="letter-icon" maxlength="2" placeholder="AB" value="${selectedIcon.length <= 2 ? selectedIcon : ''}" />
                <div class="letter-icon-preview">${selectedIcon.length <= 2 ? selectedIcon : 'AB'}</div>
              </div>
            `
                : `
              <div class="icon-grid">${iconGrid}</div>
            `
            }
          </div>
        </div>
      </div>
    `;
  };

  /**
   * Render the edit form.
   * @returns {string}
   */
  const renderForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <h2 class="add-space-title">Edit Space</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label for="edit-space-name">Name</label>
          <input type="text" id="edit-space-name" placeholder="e.g., clark, bruce, diana"
                 value="${spaceName}" autocomplete="off" />
        </div>

        ${renderIconSelector()}

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the modal content.
   */
  const render = () => {
    $container.innerHTML = renderForm();
    attachEventListeners();

    // Mount scheme picker
    const $slot = /** @type {HTMLElement | null} */ (
      $container.querySelector('#scheme-picker-slot')
    );
    if ($slot) {
      const previousValue = schemePicker ? schemePicker.getValue() : (editingSpace && editingSpace.scheme) || 'auto';
      schemePicker = createSchemePicker({
        $container: $slot,
        initialValue: previousValue,
      });
    }

    // Focus name input
    const $nameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#edit-space-name')
    );
    if ($nameInput) {
      $nameInput.focus();
      $nameInput.setSelectionRange(
        $nameInput.value.length,
        $nameInput.value.length,
      );
    }
  };

  /**
   * Attach event listeners.
   */
  const attachEventListeners = () => {
    const $backdrop = $container.querySelector('.add-space-backdrop');
    const $close = $container.querySelector('.add-space-close');
    const $cancel = $container.querySelector('.add-space-cancel');
    const $form = $container.querySelector('.add-space-form');
    const $iconOptions = $container.querySelectorAll('.icon-option');
    const $iconTabs = $container.querySelectorAll('.icon-tab');
    const $letterInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#letter-icon')
    );
    const $nameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#edit-space-name')
    );

    // Close handlers
    if ($backdrop) {
      $backdrop.addEventListener('click', () => {
        hide();
        onClose();
      });
    }
    if ($close) {
      $close.addEventListener('click', () => {
        hide();
        onClose();
      });
    }
    if ($cancel) {
      $cancel.addEventListener('click', () => {
        hide();
        onClose();
      });
    }

    // Name input
    if ($nameInput) {
      $nameInput.addEventListener('input', () => {
        spaceName = $nameInput.value;
      });
    }

    // Icon selection
    for (const $option of $iconOptions) {
      $option.addEventListener('click', () => {
        const icon = $option.getAttribute('data-icon');
        if (icon) {
          selectedIcon = icon;
          useLetterIcon = false;
          updateIconSelection();
        }
      });
    }

    // Icon tabs
    for (const $tab of $iconTabs) {
      $tab.addEventListener('click', () => {
        const tab = $tab.getAttribute('data-tab');
        useLetterIcon = tab === 'letter';
        if (useLetterIcon && selectedIcon.length > 2) {
          selectedIcon = 'AB';
        }
        render();
      });
    }

    // Letter icon input
    if ($letterInput) {
      $letterInput.addEventListener('input', () => {
        selectedIcon = letterIcon($letterInput.value || 'AB');
        const $preview = $container.querySelector('.letter-icon-preview');
        if ($preview) {
          $preview.textContent = selectedIcon;
        }
      });
    }

    // Form submission
    if ($form) {
      $form.addEventListener('submit', async e => {
        e.preventDefault();
        await handleSubmit();
      });
    }

    // Escape key handler
    const handleEscape = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && visible) {
        hide();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
  };

  /**
   * Handle form submission.
   */
  const handleSubmit = async () => {
    if (!editingSpace) return;

    const name = spaceName.trim();
    if (!name) {
      error = 'Please enter a name';
      render();
      return;
    }

    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit(editingSpace.id, {
        name,
        icon: selectedIcon,
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });

      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to save: ${/** @type {Error} */ (err).message}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Update icon selection without re-rendering.
   */
  const updateIconSelection = () => {
    const $options = $container.querySelectorAll('.icon-option');
    for (const $option of $options) {
      const icon = $option.getAttribute('data-icon');
      if (icon === selectedIcon) {
        $option.classList.add('selected');
      } else {
        $option.classList.remove('selected');
      }
    }
  };

  /**
   * Show the modal for a given space.
   *
   * @param {SpaceConfig} space
   */
  const show = space => {
    visible = true;
    editingSpace = space;
    spaceName = space.name;
    selectedIcon = space.icon;
    useLetterIcon = space.icon.length <= 2 && !ALL_ICONS.includes(space.icon);
    error = null;
    isSubmitting = false;
    schemePicker = null;

    render();
    $container.style.display = 'flex';
  };

  /**
   * Hide the modal, optionally restoring the previous color scheme.
   *
   * @param {object} [options]
   * @param {boolean} [options.restoreScheme] - Whether to restore the
   *   color scheme that was active before the picker was opened.
   */
  const hide = ({ restoreScheme = true } = {}) => {
    visible = false;
    $container.style.display = 'none';
    if (restoreScheme && schemePicker) {
      schemePicker.restoreScheme();
    }
  };

  /**
   * Check if modal is visible.
   *
   * @returns {boolean}
   */
  const isVisible = () => visible;

  // Initial state
  $container.innerHTML = '';
  $container.style.display = 'none';

  return harden({ show, hide, isVisible });
};
harden(createEditSpaceModal);
