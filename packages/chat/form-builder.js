// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { PetNamePathAutocompleteAPI } from './petname-path-autocomplete.js' */

import harden from '@endo/harden';

import { h, renderConfined } from './setup-preact-container.js';

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

// Form builder modal, migrated from imperative `innerHTML`/`createElement` DOM
// to a confined Preact tree rendered through a single `renderConfined` into a
// dedicated mount child of the host `$container`. The exported entry keeps its
// exact signature (`createFormBuilder({ $container, E, powers, onSubmit,
// onClose })`) and hardened control object (`{ show, hide, isVisible, isDirty,
// focus }`) so the caller (chat-bar-component) needs no changes, and the same
// `.form-builder-*` CSS class names are reused so styling is unchanged.
//
// COMPOSITION. The recipient pet-name path autocomplete is a host-node
// CONTROLLER (`petNamePathAutocomplete($input, $menu, opts)` owns its OWN
// `renderConfined` into a host node and returns a control object). The recipient
// input + menu are therefore PERSISTENT host nodes the modal owns, mounted
// IMPERATIVELY into a `data-recipient-anchor` slot the confined tree renders
// (cf. edit-space-modal's scheme-picker host node, send-form's host-node
// children) — NOT nested inside this form's vnode tree. The controller is
// disposed on teardown.

/**
 * @typedef {object} FormField
 * @property {string} name - Field name (key in the form values)
 * @property {string} label - Display label for the field
 * @property {string} [example] - Optional example value (used as placeholder)
 */

/**
 * @typedef {object} FormBuilderData
 * @property {string} recipient - Pet name path of the recipient
 * @property {string} description - Human-readable description
 * @property {FormField[]} fields - Field definitions
 */

/**
 * @typedef {object} FormBuilderAPI
 * @property {() => void} show - Show the form builder
 * @property {() => void} hide - Hide the form builder
 * @property {() => boolean} isVisible - Check if form is visible
 * @property {() => boolean} isDirty - Check if form has unsaved changes
 * @property {() => void} focus - Focus the first input
 */

/**
 * Plain-data view state for the confined form body.
 *
 * @typedef {object} FormBuilderView
 * @property {string} description - The current description value.
 * @property {FormField[]} fields - The current field rows.
 * @property {string} error - The current error message.
 * @property {boolean} submitDisabled - Whether the submit button is disabled.
 * @property {string} submitLabel - The submit button label.
 */

/**
 * A single field row: name + label inputs and a remove button. Pure view over
 * plain data; reports edits and removal up through callbacks. Inputs are
 * controlled SafeEvent handlers (no DOM nodes cross into the tree).
 *
 * @param {object} props
 * @param {FormField} props.field
 * @param {number} props.index
 * @param {(index: number, patch: Partial<FormField>) => void} props.onChange
 * @param {(index: number) => void} props.onRemove
 * @param {(index: number) => void} props.onNameTab
 */
const FieldRow = ({ field, index, onChange, onRemove, onNameTab }) =>
  h(
    'div',
    { class: 'form-builder-field-row', 'data-index': String(index) },
    h('input', {
      type: 'text',
      class: 'form-builder-field-name',
      placeholder: 'fieldName',
      autocomplete: 'off',
      'data-form-type': 'other',
      'data-lpignore': 'true',
      value: field.name,
      /** @param {{ target: { value: string } }} e */
      onInput: e => onChange(index, { name: e.target.value }),
      /** @param {{ key: string, shiftKey: boolean, preventDefault: () => void }} e */
      onKeyDown: e => {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          onNameTab(index);
        }
      },
    }),
    h('span', { class: 'form-builder-arrow' }, ':'),
    h('input', {
      type: 'text',
      class: 'form-builder-field-label',
      placeholder: 'Display label',
      autocomplete: 'off',
      'data-form-type': 'other',
      'data-lpignore': 'true',
      value: field.label,
      /** @param {{ target: { value: string } }} e */
      onInput: e => onChange(index, { label: e.target.value }),
    }),
    h(
      'button',
      {
        class: 'form-builder-remove-field',
        title: 'Remove',
        onClick: () => onRemove(index),
      },
      '×',
    ),
  );
harden(FieldRow);

/**
 * The confined form body — a pure function of `view` plus controller
 * callbacks. Host DOM nodes never enter this tree; the recipient input lives on
 * a persistent host node the controller re-parents into the
 * `data-recipient-anchor` slot after each render.
 *
 * @param {object} props
 * @param {FormBuilderView} props.view
 * @param {(value: string) => void} props.onDescriptionInput
 * @param {(index: number, patch: Partial<FormField>) => void} props.onFieldChange
 * @param {(index: number) => void} props.onFieldRemove
 * @param {(index: number) => void} props.onFieldNameTab
 * @param {() => void} props.onAddField
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onClose
 */
const FormBuilderBody = ({
  view,
  onDescriptionInput,
  onFieldChange,
  onFieldRemove,
  onFieldNameTab,
  onAddField,
  onSubmit,
  onClose,
}) =>
  h(
    'div',
    { class: 'form-builder' },
    h(
      'div',
      { class: 'form-builder-header' },
      h('span', { class: 'form-builder-title' }, 'Send Form Request'),
      h(
        'button',
        {
          class: 'form-builder-close',
          title: 'Close (Esc)',
          onClick: onClose,
        },
        '×',
      ),
    ),
    h(
      'div',
      { class: 'form-builder-body' },
      h(
        'div',
        { class: 'form-builder-option' },
        h('label', null, 'To'),
        // Empty anchor; the controller re-parents the persistent recipient
        // input + menu wrapper (owned by the autocomplete host controller) into
        // it after render.
        h('div', {
          class: 'form-builder-recipient-wrapper',
          'data-recipient-anchor': 'true',
        }),
      ),
      h(
        'div',
        { class: 'form-builder-option' },
        h('label', null, 'Description'),
        h('input', {
          type: 'text',
          class: 'form-builder-description',
          placeholder: 'What the form is for...',
          autocomplete: 'off',
          'data-form-type': 'other',
          'data-lpignore': 'true',
          value: view.description,
          /** @param {{ target: { value: string } }} e */
          onInput: e => onDescriptionInput(e.target.value),
        }),
      ),
      h(
        'div',
        { class: 'form-builder-fields-section' },
        h(
          'div',
          { class: 'form-builder-fields-header' },
          h('span', null, 'Fields'),
        ),
        h(
          'div',
          { class: 'form-builder-fields-list' },
          view.fields.map((field, index) =>
            h(FieldRow, {
              key: index,
              field,
              index,
              onChange: onFieldChange,
              onRemove: onFieldRemove,
              onNameTab: onFieldNameTab,
            }),
          ),
        ),
        h(
          'button',
          {
            class: 'form-builder-add-field',
            title: 'Add field',
            onClick: onAddField,
          },
          '+ Add field',
        ),
      ),
    ),
    h(
      'div',
      { class: 'form-builder-footer' },
      h('span', { class: 'form-builder-error' }, view.error),
      h(
        'button',
        {
          class: 'form-builder-submit',
          disabled: view.submitDisabled,
          onClick: onSubmit,
        },
        view.submitLabel,
      ),
    ),
  );
harden(FormBuilderBody);

/**
 * Create the form builder modal component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the form
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {(data: FormBuilderData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when form is closed
 * @returns {FormBuilderAPI}
 */
export const createFormBuilder = ({
  $container,
  E,
  powers,
  onSubmit,
  onClose,
}) => {
  let visible = false;
  let dirty = false;

  // Dedicated confined mount; siblings of `$container` are never reconciled.
  const $mount = document.createElement('div');
  $container.innerHTML = '';
  $container.appendChild($mount);

  // Persistent host nodes carrying the recipient input and its autocomplete
  // menu. Re-parented into the confined tree's anchor after each render, so the
  // input's value/focus and the autocomplete controller survive re-renders.
  const $recipientWrapper = document.createElement('div');
  const $recipientInput = document.createElement('input');
  $recipientInput.type = 'text';
  $recipientInput.className = 'form-builder-recipient';
  $recipientInput.placeholder = 'recipient';
  $recipientInput.autocomplete = 'off';
  $recipientInput.dataset.formType = 'other';
  $recipientInput.dataset.lpignore = 'true';
  const $recipientMenu = document.createElement('div');
  $recipientMenu.className = 'form-builder-recipient-menu token-menu';
  $recipientWrapper.appendChild($recipientInput);
  $recipientWrapper.appendChild($recipientMenu);

  // Initialize recipient autocomplete (host-node controller).
  /** @type {PetNamePathAutocompleteAPI} */
  const recipientAutocomplete = petNamePathAutocomplete(
    $recipientInput,
    $recipientMenu,
    { E, powers },
  );

  $recipientInput.addEventListener('input', () => {
    dirty = true;
    updateSubmitButton();
  });

  /** @type {FormBuilderView} */
  let view = harden({
    description: '',
    fields: [],
    error: '',
    submitDisabled: true,
    submitLabel: 'Send Form',
  });

  const computeSubmitDisabled = () =>
    !$recipientInput.value.trim() ||
    !view.description.trim() ||
    view.fields.length === 0;

  /**
   * Re-parent the persistent recipient wrapper into its freshly rendered
   * anchor. `renderConfined` is synchronous, so the anchor exists by the time
   * this runs.
   */
  const reattachRecipient = () => {
    const $anchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-recipient-anchor="true"]')
    );
    if ($anchor && $recipientWrapper.parentElement !== $anchor) {
      $anchor.appendChild($recipientWrapper);
    }
  };

  const rerender = () => {
    renderConfined(
      h(FormBuilderBody, {
        view,
        onDescriptionInput: value => {
          view = harden({ ...view, description: value });
          dirty = true;
          syncSubmit();
          rerender();
        },
        onFieldChange: (index, patch) => {
          const fields = view.fields.map((f, i) =>
            i === index ? harden({ ...f, ...patch }) : f,
          );
          view = harden({ ...view, fields });
          dirty = true;
          syncSubmit();
          rerender();
        },
        onFieldRemove: index => {
          const fields = view.fields.filter((_f, i) => i !== index);
          view = harden({ ...view, fields });
          dirty = true;
          syncSubmit();
          rerender();
        },
        onFieldNameTab: index => {
          // Move focus from the name input to the sibling label input.
          const $row = /** @type {HTMLElement | null} */ (
            $mount.querySelector(
              `.form-builder-field-row[data-index="${index}"]`,
            )
          );
          const $label = $row
            ? /** @type {HTMLInputElement | null} */ (
                $row.querySelector('.form-builder-field-label')
              )
            : null;
          if ($label) $label.focus();
        },
        onAddField: () => {
          addFieldRow();
        },
        onSubmit: () => {
          handleSubmit();
        },
        onClose: () => {
          resetForm();
          hide();
          onClose();
        },
      }),
      $mount,
    );
    reattachRecipient();
  };

  /** Recompute the submit-disabled flag into `view` (no render). */
  const syncSubmit = () => {
    view = harden({ ...view, submitDisabled: computeSubmitDisabled() });
  };

  const updateSubmitButton = () => {
    const submitDisabled = computeSubmitDisabled();
    if (submitDisabled !== view.submitDisabled) {
      view = harden({ ...view, submitDisabled });
      rerender();
    }
  };

  /** @param {string} message */
  const showError = message => {
    view = harden({ ...view, error: message });
    rerender();
  };

  const clearError = () => {
    if (view.error !== '') {
      view = harden({ ...view, error: '' });
      rerender();
    }
  };

  /**
   * Add a blank field row and focus its name input.
   * @param {string} [name]
   * @param {string} [label]
   */
  const addFieldRow = (name = '', label = '') => {
    const index = view.fields.length;
    view = harden({
      ...view,
      fields: [...view.fields, harden({ name, label })],
    });
    dirty = true;
    syncSubmit();
    rerender();
    // Focus the new field's name input.
    const $row = /** @type {HTMLElement | null} */ (
      $mount.querySelector(`.form-builder-field-row[data-index="${index}"]`)
    );
    const $name = $row
      ? /** @type {HTMLInputElement | null} */ (
          $row.querySelector('.form-builder-field-name')
        )
      : null;
    if ($name) $name.focus();
  };

  const handleSubmit = async () => {
    clearError();

    if (!$recipientInput.value.trim()) {
      showError('Recipient is required');
      return;
    }

    if (!view.description.trim()) {
      showError('Description is required');
      return;
    }

    // Validate fields
    const validFields = view.fields.filter(f => f.name.trim());
    if (validFields.length === 0) {
      showError('At least one field is required');
      return;
    }

    for (const field of validFields) {
      if (!field.name.trim()) {
        showError('All fields must have a name');
        return;
      }
    }

    view = harden({
      ...view,
      submitDisabled: true,
      submitLabel: 'Sending...',
    });
    rerender();

    try {
      await onSubmit({
        recipient: $recipientInput.value.trim(),
        description: view.description.trim(),
        fields: validFields.map(f =>
          harden({
            name: f.name.trim(),
            label: f.label.trim() || f.name.trim(),
          }),
        ),
      });

      // Success - reset form and close
      resetForm();
      hide();
      onClose();
    } catch (err) {
      showError(/** @type {Error} */ (err).message);
    } finally {
      view = harden({
        ...view,
        submitDisabled: computeSubmitDisabled(),
        submitLabel: 'Send Form',
      });
      rerender();
    }
  };

  const resetForm = () => {
    dirty = false;
    recipientAutocomplete.setValue('');
    view = harden({
      description: '',
      fields: [],
      error: '',
      submitDisabled: true,
      submitLabel: 'Send Form',
    });
    rerender();
  };

  const show = () => {
    visible = true;
    $container.style.display = 'block';
    $recipientInput.focus();
  };

  const hide = () => {
    visible = false;
    $container.style.display = 'none';
  };

  // Handle Escape to close, and Enter on an input field to submit. Host-side
  // listener on the container (the confined tree never sees DOM nodes).
  /** @param {KeyboardEvent} e */
  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      resetForm();
      hide();
      onClose();
      return;
    }
    // Enter submits when focused on an input field (buttons handle their own
    // Enter/click). The autocomplete on the recipient swallows its own Enter
    // when its menu is visible.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      e.target instanceof HTMLInputElement
    ) {
      e.preventDefault();
      handleSubmit();
    }
  };
  $container.addEventListener('keydown', onKeyDown);

  // Initialize as hidden, with the first render so the recipient input is
  // mounted into its anchor.
  rerender();
  hide();

  return harden({
    show,
    hide,
    isVisible: () => visible,
    isDirty: () => dirty,
    focus: () => $recipientInput.focus(),
  });
};
harden(createFormBuilder);
