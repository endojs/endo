// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { createMonacoEditor } from './monaco-wrapper.js';
import { keyCombo, modKey } from './platform-keys.js';

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
 */

/**
 * Create the define form modal component.
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
  /** @type {Slot[]} */
  let slots = [];

  $container.innerHTML = `
    <div class="eval-form">
      <div class="eval-header">
        <span class="eval-title">Define Program</span>
        <button class="eval-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="eval-editor-container"></div>
      <div class="eval-endowments">
        <div class="eval-endowments-header">
          <span>Slots</span>
        </div>
        <div class="eval-endowments-list"></div>
        <button class="eval-add-endowment" title="Add slot (${keyCombo(modKey, 'E')})">+ Add slot</button>
      </div>
      <div class="eval-footer">
        <span class="eval-error"></span>
        <button class="eval-submit" title="Define (${keyCombo(modKey, 'Enter')})">Define</button>
      </div>
    </div>
  `;

  const $editorContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.eval-editor-container')
  );
  const $slotsList = /** @type {HTMLElement} */ (
    $container.querySelector('.eval-endowments-list')
  );
  const $addSlotBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.eval-add-endowment')
  );
  const $closeBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.eval-close')
  );
  const $submitBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.eval-submit')
  );
  const $error = /** @type {HTMLElement} */ (
    $container.querySelector('.eval-error')
  );

  const editor = await createMonacoEditor($editorContainer, {
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

  $editorContainer.addEventListener('monaco-submit', () => {
    handleSubmit();
  });

  $editorContainer.addEventListener('monaco-escape', () => {
    const $firstCodeName = $slotsList.querySelector('.eval-codename');
    if ($firstCodeName) {
      /** @type {HTMLInputElement} */ ($firstCodeName).focus();
    } else {
      $submitBtn.focus();
    }
  });

  const updateSubmitButton = () => {
    $submitBtn.disabled = !source.trim();
  };

  const clearError = () => {
    $error.textContent = '';
  };

  const showError = (/** @type {string} */ message) => {
    $error.textContent = message;
  };

  /**
   * Add a slot row to the form.
   *
   * @param {string} [codeName]
   * @param {string} [label]
   */
  const addSlotRow = (codeName = '', label = '') => {
    const index = slots.length;
    slots.push({ codeName, label });

    const $row = document.createElement('div');
    $row.className = 'eval-endowment-row';
    $row.dataset.index = String(index);

    const $codeNameInput = document.createElement('input');
    $codeNameInput.type = 'text';
    $codeNameInput.className = 'eval-codename';
    $codeNameInput.placeholder = 'variableName';
    $codeNameInput.value = codeName;
    $codeNameInput.autocomplete = 'off';
    $codeNameInput.dataset.formType = 'other';
    $codeNameInput.dataset.lpignore = 'true';

    const $arrow = document.createElement('span');
    $arrow.className = 'eval-arrow';
    $arrow.textContent = '→';

    const $labelInput = document.createElement('input');
    $labelInput.type = 'text';
    $labelInput.className = 'eval-petname';
    $labelInput.placeholder = 'description for host';
    $labelInput.value = label;
    $labelInput.autocomplete = 'off';
    $labelInput.dataset.formType = 'other';
    $labelInput.dataset.lpignore = 'true';
    $labelInput.style.flex = '2';

    const $removeBtn = document.createElement('button');
    $removeBtn.className = 'eval-remove-endowment';
    $removeBtn.textContent = '×';
    $removeBtn.title = 'Remove';

    $row.appendChild($codeNameInput);
    $row.appendChild($arrow);
    $row.appendChild($labelInput);
    $row.appendChild($removeBtn);

    $slotsList.appendChild($row);

    $codeNameInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (slots[idx]) {
        slots[idx].codeName = $codeNameInput.value;
        isDirty = true;
      }
    });

    $labelInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (slots[idx]) {
        slots[idx].label = $labelInput.value;
        isDirty = true;
      }
    });

    $removeBtn.addEventListener('click', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      slots.splice(idx, 1);
      $row.remove();
      const rows = $slotsList.querySelectorAll('.eval-endowment-row');
      rows.forEach((row, i) => {
        /** @type {HTMLElement} */ (row).dataset.index = String(i);
      });
      isDirty = true;
    });

    $codeNameInput.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        $labelInput.focus();
      }
    });

    $codeNameInput.focus();
  };

  /** @param {boolean} disabled */
  const setFormDisabled = disabled => {
    $addSlotBtn.disabled = disabled;
    const $inputs = $slotsList.querySelectorAll('input');
    for (const $el of $inputs) {
      /** @type {HTMLInputElement} */ ($el).disabled = disabled;
    }
    const $removeBtns = $slotsList.querySelectorAll('.eval-remove-endowment');
    for (const $el of $removeBtns) {
      /** @type {HTMLButtonElement} */ ($el).disabled = disabled;
    }
    editor.setReadOnly(disabled);
  };

  const handleSubmit = async () => {
    clearError();

    if (!source.trim()) {
      showError('Source code is required');
      return;
    }

    for (const slot of slots) {
      if (slot.codeName && !slot.label) {
        showError(`Label required for slot "${slot.codeName}"`);
        return;
      }
      if (slot.label && !slot.codeName) {
        showError('Code name required for each slot');
        return;
      }
    }

    const validSlots = slots.filter(s => s.codeName && s.label);

    $submitBtn.classList.add('btn-spinner');
    $submitBtn.disabled = true;
    setFormDisabled(true);

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
      $submitBtn.classList.remove('btn-spinner');
      $submitBtn.disabled = false;
      $submitBtn.textContent = 'Define';
      setFormDisabled(false);
      updateSubmitButton();
    }
  };

  const resetForm = () => {
    source = '';
    slots = [];
    isDirty = false;
    editor.setValue('');
    $slotsList.innerHTML = '';
    clearError();
    updateSubmitButton();
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

  $closeBtn.addEventListener('click', () => {
    resetForm();
    hide();
    onClose();
  });

  $addSlotBtn.addEventListener('click', () => {
    addSlotRow();
  });

  $submitBtn.addEventListener('click', () => {
    handleSubmit();
  });

  $container.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      $closeBtn.click();
    }
  });

  hide();
  updateSubmitButton();

  return {
    show,
    hide,
    isVisible: () => isVisible,
    isDirty: () => isDirty,
    getData: () => ({
      source,
      slots: [...slots],
    }),
    setData: data => {
      source = data.source;
      editor.setValue(data.source);
      slots = [];
      $slotsList.innerHTML = '';
      for (const s of data.slots) {
        addSlotRow(s.codeName, s.label);
      }
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
  };
};
