// @ts-check
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/** @import { ColorScheme, SpaceConfig } from './spaces-gutter.js' */
/** @import { SchemePickerAPI } from './scheme-picker.js' */

import { Fragment, h, renderConfined } from './setup-preact-container.js';

import { ALL_ICONS, IconSelector } from './icon-selector.js';
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
 * @property {'chat' | 'forum' | 'outliner' | 'microblog'} [viewMode] - Channel view mode
 */

/**
 * @typedef {'chat' | 'forum' | 'outliner' | 'microblog'} ViewMode
 */

/**
 * The view-mode options, preserving the original labels and descriptions.
 *
 * @type {ReadonlyArray<{ mode: ViewMode, label: string, desc: string }>}
 */
const VIEW_MODE_OPTIONS = harden([
  {
    mode: 'chat',
    label: 'Traditional Chat',
    desc: 'Chronological messages with thread drill-downs',
  },
  {
    mode: 'forum',
    label: 'Forum',
    desc: 'Threaded tree view with active subtrees at bottom',
  },
  {
    mode: 'outliner',
    label: 'Outliner',
    desc: 'Collaborative document with edit history',
  },
  {
    mode: 'microblog',
    label: 'Microblog',
    desc: 'Reverse-chronological feed with profile header',
  },
]);

/**
 * @typedef {object} EditModalState
 * @property {boolean} open - Whether the modal is shown.
 * @property {SpaceConfig | null} space - The space being edited.
 * @property {string} spaceName - The current name field value.
 * @property {string} selectedIcon - The current icon (emoji or letters).
 * @property {boolean} useLetterIcon - Whether the Letter tab is active.
 * @property {ViewMode} viewMode - The selected channel view mode.
 * @property {string | null} error - The current error message, if any.
 * @property {boolean} isSubmitting - Whether a submit is in flight.
 */

/**
 * The confined modal body — a pure function of `state` plus controller
 * callbacks. Host DOM nodes never enter this tree; the scheme picker (still
 * imperative DOM) lives on a persistent host node that the controller
 * re-parents into the `data-scheme-picker-anchor` slot after each render.
 *
 * @param {object} props
 * @param {EditModalState} props.state - The current modal state.
 * @param {boolean} props.showName - Whether to render the name field.
 * @param {(patch: Partial<EditModalState>) => void} props.onPatch - Merge a
 *   partial state update (triggers a controlled re-render).
 * @param {() => void} props.onCancel - Close requested via backdrop / close /
 *   cancel.
 * @param {() => void} props.onSubmit - Submit requested via the form.
 * @returns {import('preact').VNode | null}
 */
const EditSpaceModalBody = ({
  state,
  showName,
  onPatch,
  onCancel,
  onSubmit,
}) => {
  if (!state.open || !state.space) return null;
  const { space } = state;

  const personaField =
    space.profilePath && space.profilePath.length > 0
      ? h(
          'div',
          { class: 'add-space-field' },
          h('label', null, 'Persona'),
          h(
            'div',
            { class: 'edit-space-persona' },
            space.profilePath.join(' › '),
          ),
        )
      : null;

  const nameField = showName
    ? h(
        'div',
        { class: 'add-space-field' },
        h('label', { for: 'edit-space-name' }, 'Name'),
        h('input', {
          type: 'text',
          id: 'edit-space-name',
          placeholder: 'e.g., clark, bruce, diana',
          autocomplete: 'off',
          value: state.spaceName,
          /** @param {{ target: { value: string } }} e */
          onInput: e => onPatch({ spaceName: e.target.value }),
        }),
      )
    : null;

  const iconField = h(
    'div',
    { class: 'add-space-field' },
    h(IconSelector, {
      selectedIcon: state.selectedIcon,
      useLetterIcon: state.useLetterIcon,
      /** @param {string} icon */
      onSelectIcon: icon =>
        onPatch({ selectedIcon: icon, useLetterIcon: false }),
      /** @param {boolean} useLetterIcon */
      onToggleLetterIcon: useLetterIcon => {
        /** @type {Partial<EditModalState>} */
        const patch = { useLetterIcon };
        if (useLetterIcon && state.selectedIcon.length > 2) {
          patch.selectedIcon = 'AB';
        }
        onPatch(patch);
      },
    }),
  );

  // Empty slot anchor; the controller re-parents the persistent scheme-picker
  // host node into it after each render (the picker is imperative DOM, never
  // part of the confined vnode tree).
  const schemeField = h('div', {
    class: 'add-space-field',
    'data-scheme-picker-anchor': 'true',
  });

  const viewModeField =
    space.mode === 'channel'
      ? h(
          'div',
          { class: 'add-space-field' },
          h('label', null, 'Channel View'),
          h(
            'div',
            { class: 'view-mode-selector' },
            VIEW_MODE_OPTIONS.map(({ mode, label, desc }) =>
              h(
                'button',
                {
                  key: mode,
                  type: 'button',
                  class: `view-mode-option ${
                    state.viewMode === mode ? 'selected' : ''
                  }`,
                  'data-view-mode': mode,
                  onClick: () => onPatch({ viewMode: mode }),
                },
                h('span', { class: 'view-mode-label' }, label),
                h('span', { class: 'view-mode-desc' }, desc),
              ),
            ),
          ),
        )
      : null;

  const errorField = state.error
    ? h('div', { class: 'add-space-error' }, state.error)
    : null;

  return h(
    Fragment,
    null,
    h('div', { class: 'add-space-backdrop', onClick: onCancel }),
    h(
      'div',
      { class: 'add-space-modal' },
      h(
        'div',
        { class: 'add-space-header' },
        h('h2', { class: 'add-space-title' }, 'Edit Space'),
        h(
          'button',
          {
            type: 'button',
            class: 'add-space-close',
            title: 'Close (Esc)',
            onClick: onCancel,
          },
          '×',
        ),
      ),
      h(
        'form',
        {
          class: 'add-space-form',
          /** @param {{ preventDefault: () => void }} e */
          onSubmit: e => {
            e.preventDefault();
            onSubmit();
          },
        },
        personaField,
        nameField,
        iconField,
        schemeField,
        viewModeField,
        errorField,
        h(
          'div',
          { class: 'add-space-actions' },
          h(
            'button',
            { type: 'button', class: 'add-space-cancel', onClick: onCancel },
            'Cancel',
          ),
          h(
            'button',
            {
              type: 'submit',
              class: 'add-space-submit',
              disabled: state.isSubmitting,
            },
            state.isSubmitting ? 'Saving...' : 'Save',
          ),
        ),
      ),
    ),
  );
};
harden(EditSpaceModalBody);

/**
 * Create the edit space modal component. The body is one confined Preact tree
 * rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; `show(space)` updates the tree's state (open + prefill) and
 * `hide()` closes it.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {(id: string, data: EditSpaceFormData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when modal is closed
 * @param {boolean} [options.showName] - Whether to show the name field (default: true)
 * @returns {EditSpaceModalAPI}
 */
export const createEditSpaceModal = ({
  $container,
  onSubmit,
  onClose,
  showName = true,
}) => {
  // Dedicated confined mount; siblings of `$container` are never reconciled.
  // `display: contents` keeps the modal's own flex layout (on `$container`)
  // applying to the mount's children.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';

  // Persistent host node carrying the imperative scheme picker. Re-parented
  // into the confined tree's anchor after each render, so its DOM and
  // listeners survive confined re-renders.
  const $schemePickerHost = document.createElement('div');
  $schemePickerHost.id = 'scheme-picker-slot';
  $schemePickerHost.className = 'add-space-field';

  /** @type {SchemePickerAPI | null} */
  let schemePicker = null;

  /** @type {EditModalState} */
  let state = harden({
    open: false,
    space: null,
    spaceName: '',
    selectedIcon: '\u{1f408}‍⬛',
    useLetterIcon: false,
    viewMode: 'chat',
    error: null,
    isSubmitting: false,
  });

  /** Whether the controller has been torn down (mount detached). */
  const isLive = () => $mount.isConnected;

  /**
   * Re-parent the persistent scheme-picker host into the freshly rendered
   * anchor. `renderConfined` is synchronous, so the anchor exists by the time
   * this runs.
   */
  const reattachSchemePicker = () => {
    const $anchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-scheme-picker-anchor="true"]')
    );
    if ($anchor && $schemePickerHost.parentElement !== $anchor) {
      $anchor.appendChild($schemePickerHost);
    }
  };

  /**
   * Merge a partial state update and re-render the confined tree.
   *
   * @param {Partial<EditModalState>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  /**
   * Handle form submission, preserving the original callback contract (the
   * caller's `onSubmit` performs the eventual sends).
   */
  const handleSubmit = async () => {
    if (!state.space) return;

    const name = showName ? state.spaceName.trim() : state.space.name;
    if (showName && !name) {
      patch({ error: 'Please enter a name' });
      return;
    }

    patch({ isSubmitting: true, error: null });

    try {
      /** @type {EditSpaceFormData} */
      const formData = {
        name,
        icon: state.selectedIcon,
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      };
      if (state.space.mode === 'channel') {
        formData.viewMode = state.viewMode;
      }
      await onSubmit(state.space.id, formData);

      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      patch({
        error: `Failed to save: ${/** @type {Error} */ (err).message}`,
        isSubmitting: false,
      });
    }
  };

  /**
   * Render the confined modal body for the current `state`, then re-parent the
   * scheme picker into its anchor.
   */
  const rerender = () => {
    renderConfined(
      h(EditSpaceModalBody, {
        state,
        showName,
        onPatch: patch,
        onCancel: () => {
          hide();
          onClose();
        },
        onSubmit: () => {
          handleSubmit();
        },
      }),
      $mount,
    );
    if (state.open) {
      reattachSchemePicker();
    }
  };

  /**
   * Escape-key handler; only active while the modal is open.
   *
   * @param {KeyboardEvent} e
   */
  const handleEscape = e => {
    if (e.key === 'Escape' && state.open && isLive()) {
      hide();
      onClose();
    }
  };

  /**
   * Show the modal for a given space.
   *
   * @param {SpaceConfig} space
   */
  const show = space => {
    const useLetterIcon =
      space.icon.length <= 2 && !ALL_ICONS.includes(space.icon);
    state = harden({
      open: true,
      space,
      spaceName: space.name,
      selectedIcon: space.icon,
      useLetterIcon,
      viewMode: space.viewMode || 'chat',
      error: null,
      isSubmitting: false,
    });

    // Recreate the scheme picker on the persistent host so it reflects this
    // space's scheme, then render and place it into the anchor.
    schemePicker = createSchemePicker({
      $container: $schemePickerHost,
      initialValue: space.scheme || 'auto',
    });

    rerender();

    $container.style.display = 'flex';
    document.addEventListener('keydown', handleEscape);

    // Focus the name input when shown.
    if (showName) {
      const $nameInput = /** @type {HTMLInputElement | null} */ (
        $mount.querySelector('#edit-space-name')
      );
      if ($nameInput) {
        $nameInput.focus();
        $nameInput.setSelectionRange(
          $nameInput.value.length,
          $nameInput.value.length,
        );
      }
    }
  };

  /**
   * Hide the modal, optionally restoring the previous color scheme. Teardown is
   * detach-safe: the escape listener is removed and the scheme-picker host is
   * detached so nothing leaks.
   *
   * @param {object} [options]
   * @param {boolean} [options.restoreScheme] - Whether to restore the
   *   color scheme that was active before the picker was opened.
   */
  const hide = ({ restoreScheme = true } = {}) => {
    if (restoreScheme && schemePicker) {
      schemePicker.restoreScheme();
    }
    document.removeEventListener('keydown', handleEscape);
    state = harden({ ...state, open: false });
    rerender();
    $container.style.display = 'none';
    // Detach the scheme-picker host so it does not leak into the closed modal.
    if ($schemePickerHost.parentElement) {
      $schemePickerHost.parentElement.removeChild($schemePickerHost);
    }
  };

  /**
   * Check if modal is visible.
   *
   * @returns {boolean}
   */
  const isVisible = () => state.open;

  // Initial state: mounted but closed.
  $container.innerHTML = '';
  $container.appendChild($mount);
  $container.style.display = 'none';
  rerender();

  return harden({ show, hide, isVisible });
};
harden(createEditSpaceModal);
