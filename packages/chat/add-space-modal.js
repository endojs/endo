// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

import { E } from '@endo/far';
import { petNamePathsAutocomplete } from './petname-paths-autocomplete.js';

/**
 * @typedef {object} AddSpaceModalAPI
 * @property {() => void} show - Show the modal
 * @property {() => void} hide - Hide the modal
 * @property {() => boolean} isVisible - Check if modal is visible
 */

/**
 * @typedef {object} SpaceFormData
 * @property {string} name - Display name for the space
 * @property {string} icon - Emoji or letter icon
 * @property {string[]} profilePath - Pet name path to the profile
 * @property {'mailbox'} layout - Layout type (reserved for future use)
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
 * Create the add space modal component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {unknown} options.powers - Endo host powers
 * @param {() => Set<string>} options.getUsedIcons - Returns set of icons already in use
 * @param {(data: SpaceFormData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when modal is closed
 * @returns {AddSpaceModalAPI}
 */
export const createAddSpaceModal = ({
  $container,
  powers,
  getUsedIcons,
  onSubmit,
  onClose,
}) => {
  /**
   * Get the first unused icon from the available icons.
   * @returns {string}
   */
  const getFirstUnusedIcon = () => {
    const usedIcons = getUsedIcons();
    for (const icon of ALL_ICONS) {
      if (!usedIcons.has(icon)) {
        return icon;
      }
    }
    // All icons used, return first one
    return ALL_ICONS[0];
  };

  let visible = false;
  /** @type {'choose' | 'new-agent' | 'existing'} */
  let mode = 'choose';
  let selectedIcon = '🐈‍⬛';
  let useLetterIcon = false;
  /** @type {string} */
  let handleName = '';
  /** @type {string} */
  let agentName = '';
  /** @type {boolean} */
  let agentNameManuallyEdited = false;
  /** @type {string | null} */
  let error = null;
  /** @type {boolean} */
  let isSubmitting = false;

  /** @type {import('./petname-paths-autocomplete.js').PetNamePathsAutocompleteAPI | null} */
  let pathAutocomplete = null;

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
   * Render the choose mode screen.
   * @returns {string}
   */
  const renderChooseMode = () => {
    const nextIcon = getFirstUnusedIcon();
    return `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <h2 class="add-space-title">Add Space</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="add-space-choose">
        <button type="button" class="space-type-card" data-mode="new-agent">
          <span class="space-type-icon">${nextIcon}</span>
          <span class="space-type-title">New Profile</span>
          <span class="space-type-desc">Create a fresh profile</span>
        </button>
        <button type="button" class="space-type-card" data-mode="existing">
          <span class="space-type-icon">🐈‍⬛</span>
          <span class="space-type-title">Existing Profile</span>
          <span class="space-type-desc">Connect to an existing profile</span>
        </button>
      </div>
    </div>
  `;
  };

  /**
   * Get the default agent name for a handle.
   * @param {string} handle
   * @returns {string}
   */
  const getDefaultAgentName = handle => {
    return handle ? `profile-for-${handle}` : '';
  };

  /**
   * Render the new agent form.
   * @returns {string}
   */
  const renderNewAgentForm = () => {
    const displayAgentName = agentNameManuallyEdited
      ? agentName
      : getDefaultAgentName(handleName);
    return `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">←</button>
        <h2 class="add-space-title">New Profile</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label for="handle-name">Handle</label>
          <input type="text" id="handle-name" placeholder="e.g., clark, bruce, diana"
                 value="${handleName}" autocomplete="off" />
          <div class="field-hint">The pet name for accessing this profile's powers</div>
        </div>

        <div class="add-space-field">
          <label for="agent-name">Agent Name</label>
          <input type="text" id="agent-name" placeholder="profile-for-handle"
                 value="${displayAgentName}" autocomplete="off" />
          <div class="field-hint">Internal identifier for the agent</div>
        </div>

        ${renderIconSelector()}

        <div class="add-space-field">
          <label>Layout</label>
          <div class="layout-selector">
            <button type="button" class="layout-option selected" data-layout="mailbox">
              <span class="layout-icon">📬</span>
              <span class="layout-name">Mailbox</span>
            </button>
          </div>
          <div class="field-hint">More layouts coming soon</div>
        </div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Space'}
          </button>
        </div>
      </form>
    </div>
  `;
  };

  /**
   * Render the existing profile form.
   * @returns {string}
   */
  const renderExistingForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">←</button>
        <h2 class="add-space-title">Existing Profile</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        ${renderIconSelector()}

        <div class="add-space-field">
          <label>Profile Path</label>
          <div class="petname-path-selector">
            <div id="profile-path-input" class="profile-path-input-container"></div>
            <div id="profile-path-menu" class="token-menu"></div>
          </div>
          <div class="field-hint">Use <kbd>.</kbd> to drill down, <kbd>Enter</kbd> to add space</div>
        </div>

        <div class="add-space-field">
          <label>Layout</label>
          <div class="layout-selector">
            <button type="button" class="layout-option selected" data-layout="mailbox">
              <span class="layout-icon">📬</span>
              <span class="layout-name">Mailbox</span>
            </button>
          </div>
          <div class="field-hint">More layouts coming soon</div>
        </div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Adding...' : 'Add Space'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the modal content based on current mode.
   */
  const render = () => {
    let html;
    switch (mode) {
      case 'new-agent':
        html = renderNewAgentForm();
        break;
      case 'existing':
        html = renderExistingForm();
        break;
      default:
        html = renderChooseMode();
    }

    $container.innerHTML = html;
    attachEventListeners();

    if (mode === 'existing') {
      initPathAutocomplete();
    }

    // Focus appropriate input
    if (mode === 'new-agent') {
      const $handleInput = /** @type {HTMLInputElement | null} */ (
        $container.querySelector('#handle-name')
      );
      if ($handleInput) {
        $handleInput.focus();
        $handleInput.setSelectionRange(
          $handleInput.value.length,
          $handleInput.value.length,
        );
      }
    }
  };

  /**
   * Initialize the path autocomplete component.
   */
  const initPathAutocomplete = () => {
    const $inputContainer = $container.querySelector('#profile-path-input');
    const $menu = $container.querySelector('#profile-path-menu');

    if (!$inputContainer || !$menu) return;

    // Dispose previous instance if any
    if (pathAutocomplete) {
      pathAutocomplete.dispose();
    }

    pathAutocomplete = petNamePathsAutocomplete(
      /** @type {HTMLElement} */ ($inputContainer),
      /** @type {HTMLElement} */ ($menu),
      {
        E,
        powers: /** @type {import('@endo/far').ERef<import('@endo/daemon').EndoHost>} */ (
          powers
        ),
        onSubmit: () => {
          // Trigger form submission
          const $form = $container.querySelector('.add-space-form');
          if ($form instanceof HTMLFormElement) {
            $form.requestSubmit();
          }
        },
        // Selecting completes the chip; use Shift+Tab to go back and continue drilling
        finalizeOnSelect: true,
      },
    );

    // Set default path and focus
    pathAutocomplete.setValue(['AGENT']);
    pathAutocomplete.focus();
  };

  /**
   * Attach event listeners to modal elements.
   */
  const attachEventListeners = () => {
    const $backdrop = $container.querySelector('.add-space-backdrop');
    const $close = $container.querySelector('.add-space-close');
    const $back = $container.querySelector('.add-space-back');
    const $cancel = $container.querySelector('.add-space-cancel');
    const $form = $container.querySelector('.add-space-form');
    const $iconOptions = $container.querySelectorAll('.icon-option');
    const $iconTabs = $container.querySelectorAll('.icon-tab');
    const $letterInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#letter-icon')
    );
    const $handleNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#handle-name')
    );
    const $agentNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#agent-name')
    );
    const $typeCards = $container.querySelectorAll('.space-type-card');

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

    // Back button
    if ($back) {
      $back.addEventListener('click', () => {
        mode = 'choose';
        error = null;
        render();
      });
    }

    // Type card selection
    for (const $card of $typeCards) {
      $card.addEventListener('click', () => {
        const selectedMode = $card.getAttribute('data-mode');
        if (selectedMode === 'new-agent') {
          mode = 'new-agent';
          selectedIcon = getFirstUnusedIcon();
          useLetterIcon = false;
          error = null;
          render();
        } else if (selectedMode === 'existing') {
          mode = 'existing';
          selectedIcon = '🐈‍⬛';
          useLetterIcon = false;
          error = null;
          render();
        }
      });
    }

    // Handle name input - auto-populates agent name unless manually edited
    if ($handleNameInput) {
      $handleNameInput.addEventListener('input', () => {
        handleName = $handleNameInput.value;
        // Auto-update agent name if not manually edited
        if (!agentNameManuallyEdited && $agentNameInput) {
          $agentNameInput.value = getDefaultAgentName(handleName);
        }
      });
    }

    // Agent name input - track manual edits
    if ($agentNameInput) {
      $agentNameInput.addEventListener('input', () => {
        agentName = $agentNameInput.value;
        // Mark as manually edited if user changes it from the default
        const defaultName = getDefaultAgentName(handleName);
        if ($agentNameInput.value !== defaultName) {
          agentNameManuallyEdited = true;
        }
      });
    }

    // Icon selection
    for (const $option of $iconOptions) {
      $option.addEventListener('click', () => {
        const icon = $option.getAttribute('data-icon');
        if (icon) {
          selectedIcon = icon;
          useLetterIcon = false;
          // Just update icon selection, don't re-render whole modal
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

        if (mode === 'new-agent') {
          await handleNewAgentSubmit();
        } else if (mode === 'existing') {
          await handleExistingSubmit();
        }
      });
    }

    // Escape key handler
    const handleEscape = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && visible) {
        // Don't close if autocomplete menu is visible
        if (pathAutocomplete && pathAutocomplete.isMenuVisible()) {
          return;
        }
        // If in a sub-mode, go back to choose
        if (mode !== 'choose') {
          mode = 'choose';
          error = null;
          render();
          return;
        }
        hide();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
  };

  /**
   * Handle new agent form submission.
   */
  const handleNewAgentSubmit = async () => {
    const name = handleName.trim();
    if (!name) {
      error = 'Please enter a handle name';
      render();
      return;
    }

    // Validate name (no spaces, dots, or special characters)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      error = 'Handle must start with a letter and contain only letters, numbers, hyphens, and underscores';
      render();
      return;
    }

    // Determine the agent name to use
    const finalAgentName = agentNameManuallyEdited
      ? agentName.trim()
      : getDefaultAgentName(name);

    if (!finalAgentName) {
      error = 'Please enter an agent name';
      render();
      return;
    }

    isSubmitting = true;
    error = null;
    render();

    try {
      // Create the host: handle points to powers, agentName points to the agent
      await E(
        /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
          powers
        ),
      ).provideHost(name, { agentName: finalAgentName });

      // Create the space pointing to the agent (not the handle)
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath: [finalAgentName],
        layout: 'mailbox',
      });

      hide();
      onClose();
    } catch (err) {
      error = `Failed to create host: ${/** @type {Error} */ (err).message}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Handle existing profile form submission.
   */
  const handleExistingSubmit = async () => {
    if (!pathAutocomplete) return;

    const paths = pathAutocomplete.getValue();
    if (paths.length === 0) {
      error = 'Please select a profile path';
      render();
      return;
    }

    // Use the first path
    const pathString = paths[0];
    const profilePath = pathString.split('.').filter(Boolean);

    if (profilePath.length === 0) {
      error = 'Please select a valid profile path';
      render();
      return;
    }

    // Derive name from the last segment of the profile path
    const name = profilePath[profilePath.length - 1];

    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath,
        layout: 'mailbox',
      });
      hide();
      onClose();
    } catch (err) {
      error = `Failed to add space: ${/** @type {Error} */ (err).message}`;
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
   * Show the modal.
   */
  const show = () => {
    visible = true;
    mode = 'choose';
    selectedIcon = '🐈‍⬛';
    useLetterIcon = false;
    handleName = '';
    agentName = '';
    agentNameManuallyEdited = false;
    error = null;
    isSubmitting = false;

    render();
    $container.style.display = 'flex';
  };

  /**
   * Hide the modal.
   */
  const hide = () => {
    visible = false;
    $container.style.display = 'none';
    if (pathAutocomplete) {
      pathAutocomplete.dispose();
      pathAutocomplete = null;
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
harden(createAddSpaceModal);
