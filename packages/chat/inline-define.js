// @ts-check
/* eslint-disable no-use-before-define */

/**
 * @typedef {object} ParsedDefine
 * @property {string} source - The JavaScript source code
 * @property {Array<{codeName: string, label: string}>} slots - Slot definitions
 * @property {number} [cursorPosition] - Cursor position in source
 */

/**
 * @typedef {object} InlineDefineAPI
 * @property {() => ParsedDefine} getData - Get parsed define data
 * @property {() => boolean} isValid - Check if define is valid
 * @property {(disabled: boolean) => void} setDisabled - Disable or enable
 * @property {() => void} clear - Clear the input
 * @property {() => void} focus - Focus the input
 * @property {(data: ParsedDefine) => void} setData - Set data
 * @property {() => void} dispose - Clean up
 */

/**
 * @typedef {object} SlotField
 * @property {HTMLElement} $container
 * @property {HTMLInputElement} $codeName
 * @property {HTMLInputElement} $label
 * @property {() => void} dispose
 */

/**
 * Create an inline define input component with structured slot fields.
 *
 * Typing `@` in the source input creates a new slot. Each slot has
 * a code name (JS identifier) and a label (description for the host).
 *
 * @param {object} options
 * @param {HTMLElement} options.$container
 * @param {(data: ParsedDefine) => void} options.onSubmit
 * @param {(data: ParsedDefine) => void} options.onExpand
 * @param {() => void} options.onCancel
 * @param {(isValid: boolean) => void} options.onValidityChange
 * @returns {InlineDefineAPI}
 */
export const createInlineDefine = ({
  $container,
  onSubmit,
  onExpand,
  onCancel,
  onValidityChange,
}) => {
  $container.innerHTML = `
    <div class="inline-eval-wrapper">
      <div class="inline-eval-endowments"></div>
      <input type="text" class="inline-eval-input" placeholder="expression..." />
    </div>
  `;

  const $slotsContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.inline-eval-endowments')
  );
  const $source = /** @type {HTMLInputElement} */ (
    $container.querySelector('.inline-eval-input')
  );

  /** @type {SlotField[]} */
  const slotFields = [];

  /**
   * Create a new slot field.
   *
   * @param {string} [initialCodeName]
   * @param {string} [initialLabel]
   * @returns {SlotField}
   */
  const createSlotField = (initialCodeName = '', initialLabel = '') => {
    const $field = document.createElement('div');
    $field.className = 'inline-eval-endowment-group';

    // Code name chip
    const $chip = document.createElement('div');
    $chip.className = 'inline-eval-chip';

    const $codeName = document.createElement('input');
    $codeName.type = 'text';
    $codeName.className = 'inline-eval-petname';
    $codeName.placeholder = 'name';
    $codeName.value = initialCodeName;
    $codeName.autocomplete = 'off';
    $codeName.dataset.formType = 'other';
    $codeName.dataset.lpignore = 'true';

    const $codeNameSizer = document.createElement('span');
    $codeNameSizer.className = 'inline-eval-sizer inline-eval-sizer-petname';
    $codeNameSizer.textContent = initialCodeName || 'name';

    const resizeCodeName = () => {
      $codeNameSizer.textContent = $codeName.value || $codeName.placeholder;
      $codeName.style.width = `${$codeNameSizer.offsetWidth + 4}px`;
    };

    const $codeNameWrapper = document.createElement('div');
    $codeNameWrapper.className = 'inline-eval-petname-wrapper';
    $codeNameWrapper.appendChild($codeName);
    $codeNameWrapper.appendChild($codeNameSizer);
    $chip.appendChild($codeNameWrapper);

    // Arrow separator
    const $eq = document.createElement('span');
    $eq.className = 'inline-eval-arrow';
    $eq.textContent = '→';

    // Label input
    const $label = document.createElement('input');
    $label.type = 'text';
    $label.className = 'inline-eval-codename';
    $label.placeholder = 'description';
    $label.value = initialLabel;
    $label.autocomplete = 'off';
    $label.dataset.formType = 'other';
    $label.dataset.lpignore = 'true';

    const $labelSizer = document.createElement('span');
    $labelSizer.className = 'inline-eval-sizer inline-eval-sizer-codename';

    const resizeLabel = () => {
      $labelSizer.textContent = $label.value || $label.placeholder;
      $label.style.width = `${$labelSizer.offsetWidth + 4}px`;
    };

    const $labelWrapper = document.createElement('div');
    $labelWrapper.className = 'inline-eval-codename-wrapper';
    $labelWrapper.appendChild($label);
    $labelWrapper.appendChild($labelSizer);

    $field.appendChild($chip);
    $field.appendChild($eq);
    $field.appendChild($labelWrapper);

    $codeName.addEventListener('input', () => {
      resizeCodeName();
      updateValidity();
    });

    $codeName.addEventListener('keydown', e => {
      if (e.key === '=' || e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        $label.focus();
        $label.select();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onExpand(getData(true));
        } else if (isValid()) {
          e.preventDefault();
          onSubmit(getData());
        }
      } else if (e.key === 'Backspace' && $codeName.value === '') {
        e.preventDefault();
        removeSlotField(field);
        const idx = slotFields.indexOf(field);
        if (idx > 0) {
          slotFields[idx - 1].$label.focus();
        } else {
          $source.focus();
        }
      }
    });

    $label.addEventListener('input', () => {
      resizeLabel();
      updateValidity();
    });

    $label.addEventListener('keydown', e => {
      if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        $source.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onExpand(getData(true));
        } else if (isValid()) {
          e.preventDefault();
          onSubmit(getData());
        }
      } else if (e.key === 'Backspace' && $label.value === '') {
        e.preventDefault();
        $codeName.focus();
      }
    });

    setTimeout(() => {
      resizeCodeName();
      resizeLabel();
    }, 0);

    const field = {
      $container: $field,
      $codeName,
      $label,
      dispose: () => {},
    };

    return field;
  };

  /**
   * @param {string} [codeName]
   * @param {string} [label]
   * @returns {SlotField}
   */
  const addSlotField = (codeName = '', label = '') => {
    const field = createSlotField(codeName, label);
    slotFields.push(field);
    $slotsContainer.appendChild(field.$container);
    return field;
  };

  /** @param {SlotField} field */
  const removeSlotField = field => {
    const idx = slotFields.indexOf(field);
    if (idx >= 0) {
      field.dispose();
      field.$container.remove();
      slotFields.splice(idx, 1);
      updateValidity();
    }
  };

  /**
   * @param {boolean} [includeCursor]
   * @returns {ParsedDefine}
   */
  const getData = (includeCursor = false) => {
    const slots = slotFields
      .filter(f => f.$codeName.value.trim())
      .map(f => ({
        codeName: f.$codeName.value.trim(),
        label: f.$label.value.trim() || f.$codeName.value.trim(),
      }));

    /** @type {ParsedDefine} */
    const result = {
      source: $source.value.trim(),
      slots,
    };

    if (includeCursor) {
      result.cursorPosition = $source.selectionStart ?? 0;
    }

    return result;
  };

  /** @returns {boolean} */
  const isValid = () => {
    const { source } = getData();
    return source.length > 0;
  };

  const updateValidity = () => {
    onValidityChange(isValid());
  };

  // Handle @ at start of source to create a slot
  $source.addEventListener('input', () => {
    if ($source.value.startsWith('@')) {
      $source.value = $source.value.slice(1);
      const field = addSlotField();
      field.$codeName.focus();
    }
    updateValidity();
  });

  $source.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        onExpand(getData(true));
      } else if (isValid()) {
        e.preventDefault();
        onSubmit(getData());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (
      e.key === 'Backspace' &&
      $source.value === '' &&
      slotFields.length > 0
    ) {
      e.preventDefault();
      const lastField = slotFields[slotFields.length - 1];
      lastField.$label.focus();
    }
  });

  /** @param {boolean} disabled */
  const setDisabled = disabled => {
    $source.disabled = disabled;
    for (const f of slotFields) {
      f.$codeName.disabled = disabled;
      f.$label.disabled = disabled;
    }
  };

  const clear = () => {
    $source.value = '';
    for (const f of slotFields) {
      f.dispose();
      f.$container.remove();
    }
    slotFields.length = 0;
    updateValidity();
  };

  const focus = () => {
    if (slotFields.length > 0) {
      slotFields[0].$codeName.focus();
    } else {
      $source.focus();
    }
  };

  /** @param {ParsedDefine} data */
  const setData = data => {
    clear();
    for (const slot of data.slots) {
      addSlotField(slot.codeName, slot.label);
    }
    $source.value = data.source;
    updateValidity();
  };

  const dispose = () => {
    for (const f of slotFields) {
      f.dispose();
    }
  };

  return harden({
    getData,
    isValid,
    setDisabled,
    clear,
    focus,
    setData,
    dispose,
  });
};
