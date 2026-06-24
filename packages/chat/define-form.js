// @ts-check
/* eslint-disable no-use-before-define */

import { createMonacoEditor } from '@endo/monaco-wrapper';
import { keyCombo, modKey } from './platform-keys.js';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Define form, migrated from imperative DOM to a confined Preact component.
//
// THE MONACO HOST-NODE PATTERN. A live Monaco editor is real DOM and CANNOT
// enter a confined vnode tree (`renderConfined` strips refs and real nodes). So
// the editor lives on a PERSISTENT host node — a plain `<div>` this controller
// creates once, on which `createMonacoEditor` is called imperatively. The
// confined chrome renders an empty anchor slot (`data-editor-anchor`) and, after
// each render, the controller re-parents the editor host node into that anchor.
// This is the same host-node embedding edit-space-modal uses for the scheme
// picker and send-form uses for its child controllers: only the surrounding
// chrome (header, slot rows, buttons, error area) renders confined; the editor
// host node is owned and positioned by the form. The editor is disposed on
// teardown. Later Monaco forms (eval-form, blob-viewer, counter-proposal-form)
// should copy this seam.

/**
 * @typedef {object} Slot
 * @property {string} codeName - Variable name in the source code
 * @property {string} label - Description for the host
 */

/**
 * @typedef {object} DefineFormData
 * @property {string} source - JavaScript source code
 * @property {Slot[]} slots - Code name to label mappings
 * @property {number} [cursorPosition] - Initial cursor position
 */

/**
 * @typedef {object} DefineFormAPI
 * @property {() => void} show
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 * @property {() => boolean} isDirty
 * @property {() => DefineFormData} getData
 * @property {(data: DefineFormData) => void} setData
 * @property {() => void} focus
 * @property {() => void} dispose
 */

/**
 * @typedef {object} DefineFormState
 * @property {Slot[]} slots - The current slot rows.
 * @property {boolean} canSubmit - Whether the source is non-empty.
 * @property {boolean} isSubmitting - Whether a submit is in flight.
 * @property {boolean} formDisabled - Whether inputs/buttons are disabled.
 * @property {string} error - The current error message ('' for none).
 */

/**
 * The confined chrome around the Monaco editor — a pure function of `state`
 * plus controller callbacks. Host DOM nodes never enter this tree; the Monaco
 * editor (real DOM) lives on a persistent host node that the controller
 * re-parents into the `data-editor-anchor` slot after each render. All inputs
 * are controlled with SafeEvent handlers and there is no
 * dangerouslySetInnerHTML. The original `.eval-*` CSS class names are reused so
 * styling is unchanged.
 *
 * @param {object} props
 * @param {DefineFormState} props.state - The current form state.
 * @param {() => void} props.onClose - Close requested via header button.
 * @param {() => void} props.onSubmit - Submit requested via the Define button.
 * @param {() => void} props.onAddSlot - Add-slot requested via the + button.
 * @param {(index: number, codeName: string) => void} props.onCodeNameInput -
 *   A slot's code-name input changed.
 * @param {(index: number, label: string) => void} props.onLabelInput - A
 *   slot's label input changed.
 * @param {(index: number) => void} props.onRemoveSlot - Remove a slot row.
 * @returns {import('preact').VNode}
 */
const DefineFormBody = ({
  state,
  onClose,
  onSubmit,
  onAddSlot,
  onCodeNameInput,
  onLabelInput,
  onRemoveSlot,
}) => {
  const slotRows = state.slots.map((slot, index) =>
    h(
      'div',
      { key: index, class: 'eval-endowment-row', 'data-index': String(index) },
      h('input', {
        type: 'text',
        class: 'eval-codename',
        placeholder: 'variableName',
        autocomplete: 'off',
        'data-form-type': 'other',
        'data-lpignore': 'true',
        value: slot.codeName,
        disabled: state.formDisabled,
        /** @param {{ target: { value: string } }} e */
        onInput: e => onCodeNameInput(index, e.target.value),
      }),
      h('span', { class: 'eval-arrow' }, '→'),
      h('input', {
        type: 'text',
        class: 'eval-petname',
        placeholder: 'description for host',
        autocomplete: 'off',
        'data-form-type': 'other',
        'data-lpignore': 'true',
        style: 'flex: 2',
        value: slot.label,
        disabled: state.formDisabled,
        /** @param {{ target: { value: string } }} e */
        onInput: e => onLabelInput(index, e.target.value),
      }),
      h(
        'button',
        {
          class: 'eval-remove-endowment',
          title: 'Remove',
          disabled: state.formDisabled,
          onClick: () => onRemoveSlot(index),
        },
        '×',
      ),
    ),
  );

  return h(
    'div',
    { class: 'eval-form' },
    h(
      'div',
      { class: 'eval-header' },
      h('span', { class: 'eval-title' }, 'Define Program'),
      h(
        'button',
        { class: 'eval-close', title: 'Close (Esc)', onClick: onClose },
        '×',
      ),
    ),
    // Empty anchor; the controller re-parents the persistent Monaco editor host
    // node into it after each render (the editor is imperative DOM, never part
    // of the confined vnode tree).
    h('div', { class: 'eval-editor-container', 'data-editor-anchor': 'true' }),
    h(
      'div',
      { class: 'eval-endowments' },
      h('div', { class: 'eval-endowments-header' }, h('span', null, 'Slots')),
      h('div', { class: 'eval-endowments-list' }, slotRows),
      h(
        'button',
        {
          class: 'eval-add-endowment',
          title: `Add slot (${keyCombo(modKey, 'E')})`,
          disabled: state.formDisabled,
          onClick: onAddSlot,
        },
        '+ Add slot',
      ),
    ),
    h(
      'div',
      { class: 'eval-footer' },
      h('span', { class: 'eval-error' }, state.error),
      h(
        'button',
        {
          class: state.isSubmitting ? 'eval-submit btn-spinner' : 'eval-submit',
          title: `Define (${keyCombo(modKey, 'Enter')})`,
          disabled: !state.canSubmit || state.isSubmitting,
          onClick: onSubmit,
        },
        'Define',
      ),
    ),
  );
};
harden(DefineFormBody);

/**
 * Create the define form modal component. The chrome is one confined Preact
 * tree rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; the Monaco editor lives on a persistent host node that the
 * controller re-parents into the chrome's `data-editor-anchor` slot after each
 * render.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container
 * @param {(data: DefineFormData) => Promise<void>} options.onSubmit
 * @param {() => void} options.onClose
 * @returns {Promise<DefineFormAPI>}
 */
export const createDefineForm = async ({ $container, onSubmit, onClose }) => {
  let isVisible = false;
  let isDirty = false;
  let source = '';

  /** @type {DefineFormState} */
  let state = harden({
    slots: [],
    canSubmit: false,
    isSubmitting: false,
    formDisabled: false,
    error: '',
  });

  // Dedicated confined mount; siblings of `$container` are never reconciled.
  const $mount = document.createElement('div');
  $container.appendChild($mount);

  // Persistent host node carrying the imperative Monaco editor. Re-parented into
  // the confined tree's anchor after each render, so the live editor and its
  // listeners survive confined re-renders.
  const $editorHost = document.createElement('div');
  $editorHost.className = 'eval-editor-host';
  $editorHost.style.display = 'contents';

  /**
   * Merge a partial state update and re-render the confined chrome.
   *
   * @param {Partial<DefineFormState>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  /**
   * Re-parent the persistent editor host into the freshly rendered anchor.
   * `renderConfined` is synchronous, so the anchor exists by the time this runs.
   */
  const reattachEditor = () => {
    const $anchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-editor-anchor="true"]')
    );
    if ($anchor && $editorHost.parentElement !== $anchor) {
      $anchor.appendChild($editorHost);
    }
  };

  /**
   * Render the confined chrome for the current `state`, then re-parent the
   * editor host into its anchor.
   */
  const rerender = () => {
    renderConfined(
      h(DefineFormBody, {
        state,
        onClose: () => {
          resetForm();
          hide();
          onClose();
        },
        onSubmit: () => {
          handleSubmit();
        },
        onAddSlot: () => {
          addSlotRow();
        },
        onCodeNameInput: (index, codeName) => {
          const next = state.slots.slice();
          if (next[index]) {
            next[index] = { ...next[index], codeName };
            isDirty = true;
            patch({ slots: next });
          }
        },
        onLabelInput: (index, label) => {
          const next = state.slots.slice();
          if (next[index]) {
            next[index] = { ...next[index], label };
            isDirty = true;
            patch({ slots: next });
          }
        },
        onRemoveSlot: index => {
          const next = state.slots.slice();
          next.splice(index, 1);
          isDirty = true;
          patch({ slots: next });
        },
      }),
      $mount,
    );
    reattachEditor();
  };

  // Initial render so the anchor exists before the editor is created, then
  // create the Monaco editor directly on the persistent host node.
  rerender();

  const editor = await createMonacoEditor($editorHost, {
    onChange: value => {
      source = value;
      isDirty = true;
      updateSubmitButton();
    },
    initialValue: '',
    darkMode: false,
  });

  editor.onAddEndowment(() => {
    addSlotRow();
  });

  $editorHost.addEventListener('monaco-submit', () => {
    handleSubmit();
  });

  $editorHost.addEventListener('monaco-escape', () => {
    const $firstCodeName = $mount.querySelector('.eval-codename');
    if ($firstCodeName) {
      /** @type {HTMLInputElement} */ ($firstCodeName).focus();
    } else {
      const $submit = /** @type {HTMLButtonElement | null} */ (
        $mount.querySelector('.eval-submit')
      );
      if ($submit) $submit.focus();
    }
  });

  const updateSubmitButton = () => {
    const canSubmit = !!source.trim();
    if (canSubmit !== state.canSubmit) {
      patch({ canSubmit });
    }
  };

  const clearError = () => {
    if (state.error !== '') patch({ error: '' });
  };

  const showError = (/** @type {string} */ message) => {
    patch({ error: message });
  };

  /**
   * Add a slot row to the form.
   *
   * @param {string} [codeName]
   * @param {string} [label]
   */
  const addSlotRow = (codeName = '', label = '') => {
    isDirty = true;
    patch({ slots: [...state.slots, { codeName, label }] });
    // Focus the new row's code-name input (last row, just rendered).
    const $rows = $mount.querySelectorAll('.eval-codename');
    const $last = /** @type {HTMLInputElement | null} */ (
      $rows[$rows.length - 1] || null
    );
    if ($last) $last.focus();
  };

  /** @param {boolean} disabled */
  const setFormDisabled = disabled => {
    patch({ formDisabled: disabled });
    editor.setReadOnly(disabled);
  };

  const handleSubmit = async () => {
    clearError();

    if (!source.trim()) {
      showError('Source code is required');
      return;
    }

    for (const slot of state.slots) {
      if (slot.codeName && !slot.label) {
        showError(`Label required for slot "${slot.codeName}"`);
        return;
      }
      if (slot.label && !slot.codeName) {
        showError('Code name required for each slot');
        return;
      }
    }

    const validSlots = state.slots.filter(s => s.codeName && s.label);

    patch({ isSubmitting: true });
    setFormDisabled(true);

    await null; // safe-await-separator

    try {
      await onSubmit({
        source,
        slots: validSlots,
      });
      resetForm();
      hide();
      onClose();
    } catch (err) {
      showError(/** @type {Error} */ (err).message);
    } finally {
      patch({ isSubmitting: false });
      setFormDisabled(false);
      updateSubmitButton();
    }
  };

  const resetForm = () => {
    source = '';
    isDirty = false;
    editor.setValue('');
    patch({ slots: [], error: '', canSubmit: false });
  };

  const show = () => {
    isVisible = true;
    $container.style.display = 'block';
    editor.focus();
  };

  const hide = () => {
    isVisible = false;
    $container.style.display = 'none';
  };

  /** @param {KeyboardEvent} e */
  const handleEscape = e => {
    if (e.key === 'Escape' && isVisible) {
      e.preventDefault();
      resetForm();
      hide();
      onClose();
    }
  };

  $container.addEventListener('keydown', handleEscape);

  hide();
  updateSubmitButton();

  return harden({
    show,
    hide,
    isVisible: () => isVisible,
    isDirty: () => isDirty,
    getData: () => ({
      source,
      slots: state.slots.map(s => ({ ...s })),
    }),
    setData: data => {
      source = data.source;
      editor.setValue(data.source);
      patch({ slots: data.slots.map(s => ({ ...s })), error: '' });
      isDirty = false;
      updateSubmitButton();

      if (data.cursorPosition !== undefined && data.cursorPosition >= 0) {
        const lines = data.source.slice(0, data.cursorPosition).split('\n');
        const line = lines.length;
        const column = (lines[lines.length - 1]?.length ?? 0) + 1;
        editor.setCursorPosition(line, column);
      }
      editor.focus();
    },
    focus: () => editor.focus(),
    dispose: () => {
      $container.removeEventListener('keydown', handleEscape);
      editor.dispose();
      unmount($mount);
      $mount.remove();
      if ($editorHost.parentElement) {
        $editorHost.parentElement.removeChild($editorHost);
      }
    },
  });
};
harden(createDefineForm);
