// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { PetNamePathAutocompleteAPI } from './petname-path-autocomplete.js' */

import { createMonacoEditor } from '@endo/monaco-wrapper';
import { petNamePathAutocomplete } from './petname-path-autocomplete.js';
import { keyCombo, modKey } from './platform-keys.js';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Counter-proposal form, migrated from imperative DOM to a confined Preact
// component, copying the host-node Monaco embedding pattern established in
// define-form.js / eval-form.js.
//
// THE MONACO HOST-NODE PATTERN. A live Monaco editor is real DOM and CANNOT
// enter a confined vnode tree (`renderConfined` strips refs and real nodes). So
// the editor lives on a PERSISTENT host node — a plain `<div>` this controller
// creates once, on which `createMonacoEditor` is called imperatively. The
// confined chrome renders an empty anchor slot (`data-editor-anchor`) and, after
// each render, the controller re-parents the editor host node into that anchor.
//
// THE PETNAME-AUTOCOMPLETE HOST-NODE PATTERN. `petNamePathAutocomplete` is
// likewise a host-node controller: it owns a host `<input>` and dropdown `$menu`
// imperatively (the caret stays in the input; the menu's `.visible` class is
// host DOM). Each endowment row therefore carries a PERSISTENT host node holding
// the pet-name input + menu, created once when the row is added, and re-parented
// into that row's `data-petname-anchor` slot after each render. Only the chrome
// (labels, code-name input, arrow, remove button, options, footer) renders
// confined as vnodes with controlled SafeEvent inputs. The original `.eval-*`
// CSS class names are reused so styling is unchanged.

/**
 * @typedef {object} Endowment
 * @property {string} codeName - Variable name in the source code
 * @property {string} petName - Pet name reference for the value
 */

/**
 * @typedef {object} CounterProposalData
 * @property {bigint} messageNumber - Original proposal message number
 * @property {string} source - JavaScript source code
 * @property {Endowment[]} endowments - Code name to pet name mappings
 * @property {string} resultName - Optional pet name for the result
 * @property {string} workerName - Worker to use (default: MAIN)
 */

/**
 * @typedef {object} CounterProposalFormAPI
 * @property {() => void} show - Show the form
 * @property {() => void} hide - Hide the form
 * @property {() => boolean} isVisible - Check if form is visible
 * @property {(data: CounterProposalData) => void} setProposal - Set form data from original proposal
 * @property {() => void} focus - Focus the editor
 * @property {() => void} dispose - Tear down the editor, autocompletes, and mount
 */

/**
 * One endowment row's state plus the per-row host node carrying the imperative
 * pet-name input + autocomplete dropdown. The host node is re-parented into the
 * confined row's `data-petname-anchor` slot after each render so the live input
 * and its autocomplete controller survive confined re-renders.
 *
 * @typedef {object} EndowmentRow
 * @property {Endowment} endowment - The code-name / pet-name pair.
 * @property {HTMLElement} $petNameHost - Persistent host node (input + menu).
 * @property {HTMLInputElement} $petNameInput - The pet-name text input.
 * @property {PetNamePathAutocompleteAPI} autocomplete - The autocomplete controller.
 */

/**
 * @typedef {object} CounterProposalFormState
 * @property {Endowment[]} endowments - The current endowment rows (plain data).
 * @property {boolean} canSubmit - Whether the source is non-empty.
 * @property {boolean} isSubmitting - Whether a submit is in flight.
 * @property {boolean} formDisabled - Whether inputs/buttons are disabled.
 * @property {string} error - The current error message ('' for none).
 */

/**
 * The confined chrome around the Monaco editor and the per-row pet-name
 * controllers — a pure function of `state` plus controller callbacks. Host DOM
 * nodes never enter this tree; the Monaco editor and each row's pet-name
 * input/menu live on persistent host nodes the controller re-parents into the
 * `data-editor-anchor` and `data-petname-anchor` slots after each render. All
 * remaining inputs are controlled with SafeEvent handlers and there is no
 * dangerouslySetInnerHTML.
 *
 * @param {object} props
 * @param {CounterProposalFormState} props.state - The current form state.
 * @param {string} props.resultName - Current result-name input value.
 * @param {string} props.workerName - Current worker-name input value.
 * @param {() => void} props.onClose - Close requested via header button.
 * @param {() => void} props.onSubmit - Submit requested via the submit button.
 * @param {() => void} props.onAddEndowment - Add-endowment requested via + button.
 * @param {(index: number, codeName: string) => void} props.onCodeNameInput -
 *   A row's code-name input changed.
 * @param {(index: number) => void} props.onRemoveEndowment - Remove a row.
 * @param {(index: number) => void} props.onCodeNameTab - Tab pressed in a
 *   row's code-name input.
 * @param {(resultName: string) => void} props.onResultNameInput - Result name
 *   input changed.
 * @param {(workerName: string) => void} props.onWorkerNameInput - Worker name
 *   input changed.
 * @returns {import('preact').VNode}
 */
const CounterProposalFormBody = ({
  state,
  resultName,
  workerName,
  onClose,
  onSubmit,
  onAddEndowment,
  onCodeNameInput,
  onRemoveEndowment,
  onCodeNameTab,
  onResultNameInput,
  onWorkerNameInput,
}) => {
  const endowmentRows = state.endowments.map((endowment, index) =>
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
        value: endowment.codeName,
        disabled: state.formDisabled,
        /** @param {{ target: { value: string } }} e */
        onInput: e => onCodeNameInput(index, e.target.value),
        /** @param {{ key: string, shiftKey: boolean, preventDefault: () => void }} e */
        onKeyDown: e => {
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            onCodeNameTab(index);
          }
        },
      }),
      h('span', { class: 'eval-arrow' }, '←'),
      // Empty anchor; the controller re-parents this row's persistent pet-name
      // host node (input + autocomplete menu) into it after each render.
      h('div', {
        class: 'eval-petname-wrapper',
        'data-petname-anchor': String(index),
      }),
      h(
        'button',
        {
          class: 'eval-remove-endowment',
          title: 'Remove',
          disabled: state.formDisabled,
          onClick: () => onRemoveEndowment(index),
        },
        '×',
      ),
    ),
  );

  return h(
    'div',
    { class: 'eval-form counter-proposal-form' },
    h(
      'div',
      { class: 'eval-header' },
      h('span', { class: 'eval-title' }, 'Counter-propose Evaluation'),
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
      h(
        'div',
        { class: 'eval-endowments-header' },
        h('span', null, 'Endowments'),
      ),
      h('div', { class: 'eval-endowments-list' }, endowmentRows),
      h(
        'button',
        {
          class: 'eval-add-endowment',
          title: `Add endowment (${keyCombo(modKey, 'E')})`,
          disabled: state.formDisabled,
          onClick: onAddEndowment,
        },
        '+ Add',
      ),
    ),
    h(
      'div',
      { class: 'eval-options' },
      h(
        'div',
        { class: 'eval-option' },
        h('label', { for: 'counter-result-name' }, 'Result name (optional)'),
        h('input', {
          type: 'text',
          id: 'counter-result-name',
          placeholder: 'my-result',
          value: resultName,
          disabled: state.formDisabled,
          /** @param {{ target: { value: string } }} e */
          onInput: e => onResultNameInput(e.target.value),
        }),
      ),
      h(
        'div',
        { class: 'eval-option' },
        h('label', { for: 'counter-worker-name' }, 'Worker'),
        h('input', {
          type: 'text',
          id: 'counter-worker-name',
          value: workerName,
          disabled: state.formDisabled,
          /** @param {{ target: { value: string } }} e */
          onInput: e => onWorkerNameInput(e.target.value),
        }),
      ),
    ),
    h(
      'div',
      { class: 'eval-footer' },
      h('span', { class: 'eval-error' }, state.error),
      h(
        'button',
        {
          class: state.isSubmitting
            ? 'eval-submit counter-submit btn-spinner'
            : 'eval-submit counter-submit',
          title: `Send counter-proposal (${keyCombo(modKey, 'Enter')})`,
          disabled: !state.canSubmit || state.isSubmitting,
          onClick: onSubmit,
        },
        state.isSubmitting ? 'Sending...' : 'Counter-propose Evaluate',
      ),
    ),
  );
};
harden(CounterProposalFormBody);

/**
 * Create the counter-proposal form component. The chrome is one confined Preact
 * tree rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; the Monaco editor and each endowment row's pet-name input live
 * on persistent host nodes that the controller re-parents into the chrome's
 * anchor slots after each render.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the form
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {(data: CounterProposalData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when form is closed
 * @returns {Promise<CounterProposalFormAPI>}
 */
export const createCounterProposalForm = async ({
  $container,
  E,
  powers,
  onSubmit,
  onClose,
}) => {
  let isVisible = false;
  let source = '';
  /** @type {EndowmentRow[]} */
  let rows = [];
  let resultName = '';
  let workerName = '@main';
  /** @type {bigint} */
  let messageNumber = 0n;

  /** @type {CounterProposalFormState} */
  let state = harden({
    endowments: [],
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
   * Recompute the plain-data endowment list pushed into the confined chrome.
   * @returns {Endowment[]}
   */
  const endowmentData = () => rows.map(r => ({ ...r.endowment }));

  /**
   * Merge a partial state update and re-render the confined chrome.
   *
   * @param {Partial<CounterProposalFormState>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  /**
   * Re-parent the persistent editor host and every row's persistent pet-name
   * host into their freshly rendered anchors. `renderConfined` is synchronous,
   * so the anchors exist by the time this runs.
   */
  const reattachHosts = () => {
    const $editorAnchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-editor-anchor="true"]')
    );
    if ($editorAnchor && $editorHost.parentElement !== $editorAnchor) {
      $editorAnchor.appendChild($editorHost);
    }
    rows.forEach((row, index) => {
      const $anchor = /** @type {HTMLElement | null} */ (
        $mount.querySelector(`[data-petname-anchor="${index}"]`)
      );
      if ($anchor && row.$petNameHost.parentElement !== $anchor) {
        $anchor.appendChild(row.$petNameHost);
      }
    });
  };

  /**
   * Render the confined chrome for the current `state`, then re-parent the
   * editor and pet-name hosts into their anchors.
   */
  const rerender = () => {
    renderConfined(
      h(CounterProposalFormBody, {
        state,
        resultName,
        workerName,
        onClose: () => {
          resetForm();
          hide();
          onClose();
        },
        onSubmit: () => {
          handleSubmit();
        },
        onAddEndowment: () => {
          addEndowmentRow();
        },
        onCodeNameInput: (index, codeName) => {
          const row = rows[index];
          if (row) {
            row.endowment.codeName = codeName;
            patch({ endowments: endowmentData() });
          }
        },
        onRemoveEndowment: index => {
          const [removed] = rows.splice(index, 1);
          if (removed) {
            removed.autocomplete.dispose();
            if (removed.$petNameHost.parentElement) {
              removed.$petNameHost.parentElement.removeChild(
                removed.$petNameHost,
              );
            }
          }
          patch({ endowments: endowmentData() });
        },
        onCodeNameTab: index => {
          const row = rows[index];
          if (row) row.$petNameInput.focus();
        },
        onResultNameInput: value => {
          resultName = value;
          rerender();
        },
        onWorkerNameInput: value => {
          workerName = value;
          rerender();
        },
      }),
      $mount,
    );
    reattachHosts();
  };

  // Initial render so the editor anchor exists before the editor is created,
  // then create the Monaco editor directly on the persistent host node.
  rerender();

  const editor = await createMonacoEditor($editorHost, {
    onChange: value => {
      source = value;
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
  $editorHost.addEventListener('monaco-submit', () => {
    handleSubmit();
  });

  // Handle Escape from Monaco - move focus to endowments or options
  $editorHost.addEventListener('monaco-escape', () => {
    const $firstCodeName = $mount.querySelector('.eval-codename');
    if ($firstCodeName) {
      /** @type {HTMLInputElement} */ ($firstCodeName).focus();
    } else {
      const $resultName = /** @type {HTMLInputElement | null} */ (
        $mount.querySelector('#counter-result-name')
      );
      if ($resultName) $resultName.focus();
    }
  });

  // Handle Cmd/Ctrl+N from Monaco - focus result name field
  $editorHost.addEventListener('monaco-focus-name', () => {
    const $resultName = /** @type {HTMLInputElement | null} */ (
      $mount.querySelector('#counter-result-name')
    );
    if ($resultName) $resultName.focus();
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
   * Build a persistent host node for an endowment row's pet-name input plus its
   * autocomplete dropdown, mount the autocomplete controller onto it
   * imperatively, and return the row record. The host node is re-parented into
   * the confined row's anchor by `reattachHosts`.
   *
   * @param {Endowment} endowment
   * @returns {EndowmentRow}
   */
  const makePetNameHost = endowment => {
    const $petNameHost = document.createElement('div');
    $petNameHost.style.display = 'contents';

    const $petNameInput = document.createElement('input');
    $petNameInput.type = 'text';
    $petNameInput.className = 'eval-petname';
    $petNameInput.placeholder = 'petName.path';
    $petNameInput.value = endowment.petName;
    $petNameInput.autocomplete = 'off';
    $petNameInput.dataset.formType = 'other';
    $petNameInput.dataset.lpignore = 'true';

    const $petNameMenu = document.createElement('div');
    $petNameMenu.className = 'eval-petname-menu';

    $petNameHost.appendChild($petNameInput);
    $petNameHost.appendChild($petNameMenu);

    const autocomplete = petNamePathAutocomplete($petNameInput, $petNameMenu, {
      E,
      powers,
    });

    /** @type {EndowmentRow} */
    const row = { endowment, $petNameHost, $petNameInput, autocomplete };

    // Track pet name changes on the host-owned input.
    $petNameInput.addEventListener('input', () => {
      row.endowment.petName = $petNameInput.value;
    });

    return row;
  };

  /**
   * Add an endowment row to the form.
   * @param {string} [codeName]
   * @param {string} [petName]
   */
  const addEndowmentRow = (codeName = '', petName = '') => {
    const row = makePetNameHost({ codeName, petName });
    rows.push(row);
    patch({ endowments: endowmentData() });
    // Focus the new row's code-name input (last row, just rendered).
    const $codeNames = $mount.querySelectorAll('.eval-codename');
    const $last = /** @type {HTMLInputElement | null} */ (
      $codeNames[$codeNames.length - 1] || null
    );
    if ($last) $last.focus();
  };

  /**
   * @param {boolean} disabled
   */
  const setFormDisabled = disabled => {
    for (const row of rows) {
      row.$petNameInput.disabled = disabled;
    }
    patch({ formDisabled: disabled });
    editor.setReadOnly(disabled);
  };

  const handleSubmit = async () => {
    clearError();

    if (!source.trim()) {
      showError('Source code is required');
      return;
    }

    // Validate endowments
    for (const row of rows) {
      const { codeName, petName } = row.endowment;
      if (codeName && !petName) {
        showError(`Pet name required for "${codeName}"`);
        return;
      }
      if (petName && !codeName) {
        showError('Code name required for each endowment');
        return;
      }
    }

    // Filter out empty endowments
    const validEndowments = rows
      .map(r => ({ ...r.endowment }))
      .filter(e => e.codeName && e.petName);

    patch({ isSubmitting: true });
    setFormDisabled(true);

    await null; // safe-await-separator

    try {
      await onSubmit({
        messageNumber,
        source,
        endowments: validEndowments,
        resultName: resultName.trim(),
        workerName: workerName.trim() || '@main',
      });

      // Success - reset form and close
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

  /** Dispose and forget every endowment row's host node and controller. */
  const clearRows = () => {
    for (const row of rows) {
      row.autocomplete.dispose();
      if (row.$petNameHost.parentElement) {
        row.$petNameHost.parentElement.removeChild(row.$petNameHost);
      }
    }
    rows = [];
  };

  const resetForm = () => {
    source = '';
    clearRows();
    resultName = '';
    workerName = '@main';
    messageNumber = 0n;

    editor.setValue('');
    patch({ endowments: [], error: '', canSubmit: false });
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

  // Initialize as hidden
  hide();
  updateSubmitButton();

  return harden({
    show,
    hide,
    isVisible: () => isVisible,
    setProposal: data => {
      messageNumber = data.messageNumber;
      source = data.source;
      editor.setValue(data.source);
      clearRows();
      for (const e of data.endowments) {
        rows.push(
          makePetNameHost({ codeName: e.codeName, petName: e.petName }),
        );
      }
      resultName = data.resultName;
      workerName = data.workerName;
      patch({ endowments: endowmentData(), error: '' });
      updateSubmitButton();
      editor.focus();
    },
    focus: () => editor.focus(),
    dispose: () => {
      $container.removeEventListener('keydown', handleEscape);
      clearRows();
      editor.dispose();
      unmount($mount);
      $mount.remove();
      if ($editorHost.parentElement) {
        $editorHost.parentElement.removeChild($editorHost);
      }
    },
  });
};
harden(createCounterProposalForm);
