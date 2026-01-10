// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

import { createMonacoEditor } from './monaco-wrapper.js';
import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

/**
 * @typedef {object} Endowment
 * @property {string} codeName - Variable name in the source code
 * @property {string} petName - Pet name reference for the value
 */

/**
 * @typedef {object} EvalFormData
 * @property {string} source - JavaScript source code
 * @property {Endowment[]} endowments - Code name to pet name mappings
 * @property {string} resultName - Optional pet name for the result
 * @property {string} workerName - Worker to use (default: MAIN)
 */

/**
 * @typedef {object} EvalFormAPI
 * @property {() => void} show - Show the eval form
 * @property {() => void} hide - Hide the eval form
 * @property {() => boolean} isVisible - Check if form is visible
 * @property {() => boolean} isDirty - Check if form has unsaved changes
 * @property {() => EvalFormData} getData - Get current form data
 * @property {(data: EvalFormData) => void} setData - Set form data (for history)
 * @property {() => void} focus - Focus the editor
 */

/**
 * Create the eval form component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the form
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {unknown} options.powers - Powers object
 * @param {(data: EvalFormData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when form is closed
 * @returns {Promise<EvalFormAPI>}
 */
export const createEvalForm = async ({
  $container,
  E,
  powers,
  onSubmit,
  onClose,
}) => {
  let isVisible = false;
  let isDirty = false;
  let source = '';
  /** @type {Endowment[]} */
  let endowments = [];
  let resultName = '';
  let workerName = 'MAIN';

  // Create form HTML structure
  $container.innerHTML = `
    <div class="eval-form">
      <div class="eval-header">
        <span class="eval-title">Evaluate</span>
        <button class="eval-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="eval-editor-container"></div>
      <div class="eval-endowments">
        <div class="eval-endowments-header">
          <span>Endowments</span>
        </div>
        <div class="eval-endowments-list"></div>
        <button class="eval-add-endowment" title="Add endowment (Cmd+E)">+ Add</button>
      </div>
      <div class="eval-options">
        <div class="eval-option">
          <label for="eval-result-name">Result name (optional)</label>
          <input type="text" id="eval-result-name" placeholder="my-result" />
        </div>
        <div class="eval-option">
          <label for="eval-worker-name">Worker</label>
          <input type="text" id="eval-worker-name" value="MAIN" />
        </div>
      </div>
      <div class="eval-footer">
        <span class="eval-error"></span>
        <button class="eval-submit" title="Evaluate (Cmd+Enter)">Evaluate</button>
      </div>
    </div>
  `;

  const $editorContainer = /** @type {HTMLElement} */ ($container.querySelector('.eval-editor-container'));
  const $endowmentsList = /** @type {HTMLElement} */ ($container.querySelector('.eval-endowments-list'));
  const $addEndowmentBtn = /** @type {HTMLButtonElement} */ ($container.querySelector('.eval-add-endowment'));
  const $resultNameInput = /** @type {HTMLInputElement} */ ($container.querySelector('#eval-result-name'));
  const $workerNameInput = /** @type {HTMLInputElement} */ ($container.querySelector('#eval-worker-name'));
  const $closeBtn = /** @type {HTMLButtonElement} */ ($container.querySelector('.eval-close'));
  const $submitBtn = /** @type {HTMLButtonElement} */ ($container.querySelector('.eval-submit'));
  const $error = /** @type {HTMLElement} */ ($container.querySelector('.eval-error'));

  // Create Monaco editor
  const editor = await createMonacoEditor($editorContainer, {
    onChange: value => {
      source = value;
      isDirty = true;
      updateSubmitButton();
    },
    initialValue: '',
    darkMode: false,
  });

  // Handle Cmd+E from Monaco
  editor.onAddEndowment(() => {
    addEndowmentRow();
  });

  // Handle Cmd+Enter from Monaco
  $editorContainer.addEventListener('monaco-submit', () => {
    handleSubmit();
  });

  // Handle Escape from Monaco - move focus to endowments or options
  $editorContainer.addEventListener('monaco-escape', () => {
    // Focus the first endowment codename input, or result name if no endowments
    const $firstCodeName = $endowmentsList.querySelector('.eval-codename');
    if ($firstCodeName) {
      /** @type {HTMLInputElement} */ ($firstCodeName).focus();
    } else {
      $resultNameInput.focus();
    }
  });

  // Handle Cmd/Ctrl+N from Monaco - focus result name field
  $editorContainer.addEventListener('monaco-focus-name', () => {
    $resultNameInput.focus();
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
   * Add an endowment row to the form.
   * @param {string} [codeName]
   * @param {string} [petName]
   */
  const addEndowmentRow = (codeName = '', petName = '') => {
    const index = endowments.length;
    endowments.push({ codeName, petName });

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
    $arrow.textContent = '←';

    const $petNameWrapper = document.createElement('div');
    $petNameWrapper.className = 'eval-petname-wrapper';

    const $petNameInput = document.createElement('input');
    $petNameInput.type = 'text';
    $petNameInput.className = 'eval-petname';
    $petNameInput.placeholder = 'petName.path';
    $petNameInput.value = petName;
    $petNameInput.autocomplete = 'off';
    $petNameInput.dataset.formType = 'other';
    $petNameInput.dataset.lpignore = 'true';

    const $petNameMenu = document.createElement('div');
    $petNameMenu.className = 'eval-petname-menu';

    $petNameWrapper.appendChild($petNameInput);
    $petNameWrapper.appendChild($petNameMenu);

    const $removeBtn = document.createElement('button');
    $removeBtn.className = 'eval-remove-endowment';
    $removeBtn.textContent = '×';
    $removeBtn.title = 'Remove';

    $row.appendChild($codeNameInput);
    $row.appendChild($arrow);
    $row.appendChild($petNameWrapper);
    $row.appendChild($removeBtn);

    $endowmentsList.appendChild($row);

    // Initialize pet name path autocomplete
    petNamePathAutocomplete($petNameInput, $petNameMenu, {
      E,
      powers,
    });

    // Track code name changes
    $codeNameInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (endowments[idx]) {
        endowments[idx].codeName = $codeNameInput.value;
        isDirty = true;
      }
    });

    // Track pet name changes
    $petNameInput.addEventListener('input', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      if (endowments[idx]) {
        endowments[idx].petName = $petNameInput.value;
        isDirty = true;
      }
    });

    // Handle remove button
    $removeBtn.addEventListener('click', () => {
      const idx = parseInt($row.dataset.index || '0', 10);
      endowments.splice(idx, 1);
      $row.remove();
      // Re-index remaining rows
      const rows = $endowmentsList.querySelectorAll('.eval-endowment-row');
      rows.forEach((row, i) => {
        /** @type {HTMLElement} */ (row).dataset.index = String(i);
      });
      isDirty = true;
    });

    // Tab from codename goes to petname
    $codeNameInput.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        $petNameInput.focus();
      }
    });

    // Focus the code name input
    $codeNameInput.focus();
  };

  const handleSubmit = async () => {
    clearError();

    if (!source.trim()) {
      showError('Source code is required');
      return;
    }

    // Validate endowments
    for (const endowment of endowments) {
      if (endowment.codeName && !endowment.petName) {
        showError(`Pet name required for "${endowment.codeName}"`);
        return;
      }
      if (endowment.petName && !endowment.codeName) {
        showError('Code name required for each endowment');
        return;
      }
    }

    // Filter out empty endowments
    const validEndowments = endowments.filter(e => e.codeName && e.petName);

    $submitBtn.disabled = true;
    $submitBtn.textContent = 'Evaluating...';

    try {
      await onSubmit({
        source,
        endowments: validEndowments,
        resultName: $resultNameInput.value.trim(),
        workerName: $workerNameInput.value.trim() || 'MAIN',
      });

      // Success - reset form and close
      resetForm();
      hide();
      onClose();
    } catch (err) {
      showError(/** @type {Error} */ (err).message);
    } finally {
      $submitBtn.disabled = false;
      $submitBtn.textContent = 'Evaluate';
      updateSubmitButton();
    }
  };

  const resetForm = () => {
    source = '';
    endowments = [];
    resultName = '';
    workerName = 'MAIN';
    isDirty = false;

    editor.setValue('');
    $endowmentsList.innerHTML = '';
    $resultNameInput.value = '';
    $workerNameInput.value = 'MAIN';
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

  // Event handlers
  $closeBtn.addEventListener('click', () => {
    if (isDirty) {
      // Could add confirmation dialog here
    }
    resetForm();
    hide();
    onClose();
  });

  $addEndowmentBtn.addEventListener('click', () => {
    addEndowmentRow();
  });

  $submitBtn.addEventListener('click', () => {
    handleSubmit();
  });

  // Track option changes
  $resultNameInput.addEventListener('input', () => {
    resultName = $resultNameInput.value;
    isDirty = true;
  });

  $workerNameInput.addEventListener('input', () => {
    workerName = $workerNameInput.value;
    isDirty = true;
  });

  // Handle Escape to close
  $container.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      $closeBtn.click();
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
    getData: () => ({
      source,
      endowments: [...endowments],
      resultName,
      workerName,
    }),
    setData: data => {
      source = data.source;
      editor.setValue(data.source);
      endowments = [];
      $endowmentsList.innerHTML = '';
      for (const e of data.endowments) {
        addEndowmentRow(e.codeName, e.petName);
      }
      resultName = data.resultName;
      $resultNameInput.value = data.resultName;
      workerName = data.workerName;
      $workerNameInput.value = data.workerName;
      isDirty = false;
      updateSubmitButton();
    },
    focus: () => editor.focus(),
  };
};
