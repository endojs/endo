// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

/**
 * @typedef {object} FormField
 * @property {string} name - Field name (key in the form values)
 * @property {string} label - Display label for the field
 */

/**
 * @typedef {object} FormBuilderData
 * @property {string} recipient - Pet name path of the recipient
 * @property {string} description - Human-readable description
 * @property {FormField[]} fields - Field definitions
 * @property {string} resultName - Optional pet name for the result
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
  let isVisible = false;
  let isDirty = false;
  /** @type {FormField[]} */
  let fields = [];

  // Create form HTML structure
  $container.innerHTML = `
    <div class="form-builder">
      <div class="form-builder-header">
        <span class="form-builder-title">Send Form Request</span>
        <button class="form-builder-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="form-builder-body">
        <div class="form-builder-option">
          <label>To</label>
          <div class="form-builder-recipient-wrapper">
            <input type="text" class="form-builder-recipient" placeholder="recipient" autocomplete="off" data-form-type="other" data-lpignore="true" />
            <div class="form-builder-recipient-menu token-menu"></div>
          </div>
        </div>
        <div class="form-builder-option">
          <label>Description</label>
          <input type="text" class="form-builder-description" placeholder="What the form is for..." autocomplete="off" data-form-type="other" data-lpignore="true" />
        </div>
        <div class="form-builder-fields-section">
          <div class="form-builder-fields-header">
            <span>Fields</span>
          </div>
          <div class="form-builder-fields-list"></div>
          <button class="form-builder-add-field" title="Add field">+ Add field</button>
        </div>
        <div class="form-builder-option">
          <label>Save response as (optional)</label>
          <input type="text" class="form-builder-result-name" placeholder="result-name" autocomplete="off" data-form-type="other" data-lpignore="true" />
        </div>
      </div>
      <div class="form-builder-footer">
        <span class="form-builder-error"></span>
        <button class="form-builder-submit">Send Form</button>
      </div>
    </div>
  `;

  const $recipientInput = /** @type {HTMLInputElement} */ (
    $container.querySelector('.form-builder-recipient')
  );
  const $recipientMenu = /** @type {HTMLElement} */ (
    $container.querySelector('.form-builder-recipient-menu')
  );
  const $descriptionInput = /** @type {HTMLInputElement} */ (
    $container.querySelector('.form-builder-description')
  );
  const $fieldsList = /** @type {HTMLElement} */ (
    $container.querySelector('.form-builder-fields-list')
  );
  const $addFieldBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.form-builder-add-field')
  );
  const $resultNameInput = /** @type {HTMLInputElement} */ (
    $container.querySelector('.form-builder-result-name')
  );
  const $closeBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.form-builder-close')
  );
  const $submitBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.form-builder-submit')
  );
  const $error = /** @type {HTMLElement} */ (
    $container.querySelector('.form-builder-error')
  );

  // Initialize recipient autocomplete
  petNamePathAutocomplete($recipientInput, $recipientMenu, { E, powers });

  const updateSubmitButton = () => {
    $submitBtn.disabled =
      !$recipientInput.value.trim() ||
      !$descriptionInput.value.trim() ||
      fields.length === 0;
  };

  const clearError = () => {
    $error.textContent = '';
  };

  const showError = (/** @type {string} */ message) => {
    $error.textContent = message;
  };

  /**
   * Add a field row to the form.
   * @param {string} [name]
   * @param {string} [label]
   */
  const addFieldRow = (name = '', label = '') => {
    const index = fields.length;
    fields.push({ name, label });

    const $row = document.createElement('div');
    $row.className = 'form-builder-field-row';
    $row.dataset.index = String(index);

    const $nameInput = document.createElement('input');
    $nameInput.type = 'text';
    $nameInput.className = 'form-builder-field-name';
    $nameInput.placeholder = 'fieldName';
    $nameInput.value = name;
    $nameInput.autocomplete = 'off';
    $nameInput.dataset.formType = 'other';
    $nameInput.dataset.lpignore = 'true';

    const $arrow = document.createElement('span');
    $arrow.className = 'form-builder-arrow';
    $arrow.textContent = ':';

    const $labelInput = document.createElement('input');
    $labelInput.type = 'text';
    $labelInput.className = 'form-builder-field-label';
    $labelInput.placeholder = 'Display label';
    $labelInput.value = label;
    $labelInput.autocomplete = 'off';
    $labelInput.dataset.formType = 'other';
    $labelInput.dataset.lpignore = 'true';

    const $removeBtn = document.createElement('button');
    $removeBtn.className = 'form-builder-remove-field';
    $removeBtn.textContent = '\u00d7';
    $removeBtn.title = 'Remove';

    $row.appendChild($nameInput);
    $row.appendChild($arrow);
    $row.appendChild($labelInput);
    $row.appendChild($removeBtn);

    $fieldsList.appendChild($row);

    // Track name changes
    $nameInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (fields[idx]) {
        fields[idx].name = $nameInput.value;
        isDirty = true;
        updateSubmitButton();
      }
    });

    // Track label changes
    $labelInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (fields[idx]) {
        fields[idx].label = $labelInput.value;
        isDirty = true;
      }
    });

    // Handle remove button
    $removeBtn.addEventListener('click', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      fields.splice(idx, 1);
      $row.remove();
      // Re-index remaining rows
      const rows = $fieldsList.querySelectorAll('.form-builder-field-row');
      rows.forEach((row, i) => {
        /** @type {HTMLElement} */ (row).dataset.index = String(i);
      });
      isDirty = true;
      updateSubmitButton();
    });

    // Tab from name goes to label
    $nameInput.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        $labelInput.focus();
      }
    });

    // Focus the name input
    $nameInput.focus();
    isDirty = true;
    updateSubmitButton();
  };

  const handleSubmit = async () => {
    clearError();

    if (!$recipientInput.value.trim()) {
      showError('Recipient is required');
      return;
    }

    if (!$descriptionInput.value.trim()) {
      showError('Description is required');
      return;
    }

    // Validate fields
    const validFields = fields.filter(f => f.name.trim());
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

    $submitBtn.disabled = true;
    $submitBtn.textContent = 'Sending...';

    try {
      await onSubmit({
        recipient: $recipientInput.value.trim(),
        description: $descriptionInput.value.trim(),
        fields: validFields.map(f => ({
          name: f.name.trim(),
          label: f.label.trim() || f.name.trim(),
        })),
        resultName: $resultNameInput.value.trim(),
      });

      // Success - reset form and close
      resetForm();
      hide();
      onClose();
    } catch (err) {
      showError(/** @type {Error} */ (err).message);
    } finally {
      $submitBtn.disabled = false;
      $submitBtn.textContent = 'Send Form';
      updateSubmitButton();
    }
  };

  const resetForm = () => {
    fields = [];
    isDirty = false;

    $recipientInput.value = '';
    $descriptionInput.value = '';
    $fieldsList.innerHTML = '';
    $resultNameInput.value = '';
    clearError();
    updateSubmitButton();
  };

  const show = () => {
    isVisible = true;
    $container.style.display = 'block';
    $recipientInput.focus();
  };

  const hide = () => {
    isVisible = false;
    $container.style.display = 'none';
  };

  // Event handlers
  $closeBtn.addEventListener('click', () => {
    resetForm();
    hide();
    onClose();
  });

  $addFieldBtn.addEventListener('click', () => {
    addFieldRow();
  });

  $submitBtn.addEventListener('click', () => {
    handleSubmit();
  });

  // Track input changes for dirty state
  $recipientInput.addEventListener('input', () => {
    isDirty = true;
    updateSubmitButton();
  });

  $descriptionInput.addEventListener('input', () => {
    isDirty = true;
    updateSubmitButton();
  });

  $resultNameInput.addEventListener('input', () => {
    isDirty = true;
  });

  // Handle Escape to close
  $container.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      $closeBtn.click();
    }
  });

  // Handle Cmd+Enter to submit
  $container.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  });

  // Initialize as hidden
  hide();
  updateSubmitButton();

  return {
    show,
    hide,
    isVisible: () => isVisible,
    isDirty: () => isDirty,
    focus: () => $recipientInput.focus(),
  };
};
