// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderConfined, unmount } from '@endo/preact-container/renderer';

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

// Inline eval input, migrated from imperative `innerHTML`/`createElement` DOM to
// confined Preact rendered through `renderConfined`. The exported entry,
// `createInlineEval({...})`, keeps its exact options object
// (`$container`, `E`, `powers`, `onSubmit`, `onExpand`, `onCancel`,
// `onValidityChange`) and the hardened control object (`getData`, `isValid`,
// `setDisabled`, `clear`, `focus`, `setData`, `dispose`) so its only caller —
// inline-command-form.js — needs no changes.
//
// COMPOSITION. Each endowment row's pet-name field is owned by
// `petNamePathAutocomplete`, which is itself a host-node CONTROLLER: it reads
// and writes the host `<input>`'s value, drives focus, dispatches `input`
// events, and renders only its dropdown body confined into a host `$menu`. That
// input therefore CANNOT be a Preact-controlled node. So an endowment row is a
// host-node controller too (cf. send-form's heat bar / token autocomplete and
// edit-space-modal's scheme picker): its pet-name input, sizer, menu, arrow, and
// the code-name input are host nodes the row owns imperatively, and the
// `petNamePathAutocomplete` controller is mounted imperatively into the row's
// host `$menu`. The code-name input renders confined into a DEDICATED mount child
// inside the row so its `value`/`disabled` stay declarative SafeEvent-driven
// state. Host DOM nodes never enter a vnode tree, and there is no
// dangerouslySetInnerHTML.
//
// The view's whole authoritative state (the source expression, the disabled
// flag, and which field should hold focus) lives in the host closure, not in a
// component, so `getData`/`isValid` always read a synchronously-fresh value
// rather than racing Preact's deferred effect flush. A small `Root` mirrors the
// source/disabled/focus state for display via a mutable controller, exactly as
// inline-define.js does. The same `.inline-eval-*` CSS class names are reused so
// the styling from index.css continues to apply.

/**
 * @typedef {object} ParsedEval
 * @property {string} source - The JavaScript source code
 * @property {Array<{codeName: string, petName: string}>} endowments - Parsed endowments
 * @property {number} [cursorPosition] - Cursor position in source (0-indexed character offset)
 */

/**
 * @typedef {object} InlineEvalAPI
 * @property {() => ParsedEval} getData - Get parsed eval data
 * @property {() => boolean} isValid - Check if eval is valid
 * @property {(disabled: boolean) => void} setDisabled - Disable or enable all fields
 * @property {() => void} clear - Clear the input
 * @property {() => void} focus - Focus the input
 * @property {(data: ParsedEval) => void} setData - Set data (for expansion from modal)
 * @property {() => void} dispose - Clean up
 */

/**
 * One endowment row: a host-node controller owning its pet-name input (with
 * autocomplete), the arrow separator, and a confined code-name input.
 *
 * @typedef {object} EndowmentRow
 * @property {HTMLElement} $row - The row's root host element.
 * @property {() => string} getPetName - Current trimmed-on-read pet name.
 * @property {() => string} getCodeName - Current code name.
 * @property {(disabled: boolean) => void} setDisabled - Toggle row inputs.
 * @property {() => void} focus - Focus the pet-name input.
 * @property {() => boolean} isMenuVisible - Whether the autocomplete menu is up.
 * @property {() => void} dispose - Tear down the row.
 */

/**
 * Code-name view state pushed into a row's confined code-name input.
 *
 * @typedef {object} CodeNameState
 * @property {string} value
 * @property {boolean} disabled
 * @property {number} focusNonce - Bumped to re-apply autofocus on a request.
 */

/**
 * Mutable bridge between a row's host controller and its confined code-name
 * input. The component writes its setter; the host writes the change/keydown
 * callbacks. Not hardened — both sides assign onto it.
 *
 * @typedef {object} CodeNameController
 * @property {(s: CodeNameState) => void} [setState]
 * @property {CodeNameState} [pendingState] - Buffered so a render before the
 *   effect wires `setState` is applied on mount rather than dropped.
 * @property {(value: string) => void} [onInput]
 * @property {(e: { key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }) => void} [onKeyDown]
 */

/**
 * Source-input view state pushed into the confined `Root`.
 *
 * @typedef {object} SourceState
 * @property {string} value
 * @property {boolean} disabled
 */

/**
 * @typedef {object} SourceController
 * @property {(s: SourceState) => void} [setState]
 */

/**
 * Convert a pet name to a valid JavaScript identifier.
 * - Takes the last segment of a dot-path
 * - Converts kebab-case to camelCase
 * - Removes invalid characters
 *
 * @param {string} petName
 * @returns {string}
 */
const toJsIdentifier = petName => {
  // Get last segment of path
  const parts = petName.split('/');
  let name = parts[parts.length - 1] || '';

  // Convert kebab-case to camelCase
  name = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  // Remove leading digits and invalid chars
  name = name.replace(/^[0-9]+/, '').replace(/[^a-zA-Z0-9_$]/g, '');

  return name;
};
harden(toJsIdentifier);

/**
 * The `size` attribute for a content-sized input: the larger of the value and
 * placeholder lengths, with a small floor so an empty field is still tappable.
 * The original imperative code measured a hidden "sizer" span's `offsetWidth`;
 * under confinement a node's width is unreadable, so the input sizes itself
 * declaratively via the `size` attribute (character count) instead.
 *
 * @param {string} value
 * @param {string} placeholder
 * @returns {number}
 */
const fieldSize = (value, placeholder) =>
  Math.max(value.length, placeholder.length, 3) + 1;
harden(fieldSize);

/**
 * The confined code-name input. Controlled: its `value`/`disabled` are Preact
 * state pushed by the host, and `onInput`/`onKeyDown` report the frozen
 * SafeEvent's data back through the controller.
 *
 * @param {object} props
 * @param {CodeNameController} props.controller
 */
const CodeNameInput = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {CodeNameState} */ (
      controller.pendingState || { value: '', disabled: false, focusNonce: 0 }
    ),
  );

  useEffect(() => {
    controller.setState = setState;
    if (controller.pendingState !== undefined) {
      setState(controller.pendingState);
    }
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
    // Mount-only: `controller` is a stable per-row object. Keying on it makes
    // the effect re-run every render under confinement (the sanitizer reissues
    // the prop's identity each pass), and re-applying `setState(pendingState)`
    // — whose identity is likewise reissued — defeats Preact's Object.is bail,
    // spinning a slow render/effect feedback loop that never settles (the
    // Node-slow-runner CI hang).
  }, []);

  return h('input', {
    // Re-key on the focus nonce so a focus request re-applies autofocus.
    key: state.focusNonce ? `codeName-${state.focusNonce}` : undefined,
    type: 'text',
    class: 'inline-eval-codename',
    placeholder: 'varName',
    value: state.value,
    disabled: state.disabled,
    autocomplete: 'off',
    autofocus: state.focusNonce > 0,
    size: fieldSize(state.value, 'varName'),
    'data-form-type': 'other',
    'data-lpignore': 'true',
    /** @param {{ target: { value: string } }} e */
    onInput: e => {
      if (controller.onInput) controller.onInput(e.target.value);
    },
    /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
    onKeyDown: e => {
      if (controller.onKeyDown) controller.onKeyDown(e);
    },
  });
};
harden(CodeNameInput);

/**
 * Root component for the source expression input. Owns no authoritative state;
 * it mirrors the source value/disabled/focus the host pushes through the
 * controller, exactly as inline-define.js's Root does.
 *
 * @param {object} props
 * @param {SourceController} props.controller
 * @param {SourceState} props.initialState
 * @param {(value: string) => void} props.onInput
 * @param {(e: { key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }) => void} props.onKeyDown
 */
const Root = ({ controller, initialState, onInput, onKeyDown }) => {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    controller.setState = setState;
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
    // Mount-only — see CodeNameInput above.
  }, []);

  return h('input', {
    type: 'text',
    class: 'inline-eval-input',
    placeholder: 'expression...',
    value: state.value,
    disabled: state.disabled,
    /** @param {{ target: { value: string } }} e */
    onInput: e => onInput(e.target.value),
    /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
    onKeyDown: e => onKeyDown(e),
  });
};
harden(Root);

/**
 * Create an inline eval input component with structured endowment fields.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container for the input
 * @param {typeof import('@endo/eventual-send').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object for autocomplete
 * @param {(data: ParsedEval) => void} options.onSubmit - Called on Enter
 * @param {(data: ParsedEval) => void} options.onExpand - Called on Cmd+Enter to expand to modal
 * @param {() => void} options.onCancel - Called on Escape
 * @param {(isValid: boolean) => void} options.onValidityChange - Called when validity changes
 * @returns {InlineEvalAPI}
 */
export const createInlineEval = ({
  $container,
  E,
  powers,
  onSubmit,
  onExpand,
  onCancel,
  onValidityChange,
}) => {
  // Structural host containers. These are plain layout nodes (not data-driven
  // view), so they are built imperatively, mirroring the original markup. The
  // endowment rows — host-node controllers owning the autocomplete inputs — are
  // mounted into `$endowmentsContainer`; the confined source input renders into a
  // dedicated mount child placed after them inside `$wrapper`.
  const $wrapper = document.createElement('div');
  $wrapper.className = 'inline-eval-wrapper';

  const $endowmentsContainer = document.createElement('div');
  $endowmentsContainer.className = 'inline-eval-endowments';

  const $sourceMount = document.createElement('div');
  $sourceMount.className = 'inline-eval-source-mount';

  $wrapper.appendChild($endowmentsContainer);
  $wrapper.appendChild($sourceMount);
  $container.appendChild($wrapper);

  /** @type {EndowmentRow[]} */
  const endowmentRows = [];

  let disabled = false;

  // Authoritative source state lives here in the host closure so `getData`/
  // `isValid` are read synchronously-fresh regardless of Preact's flush timing.
  let sourceValue = '';

  // Mutable bridge to the source Root's state setter (populated by its effect).
  // Intentionally NOT hardened — the component writes onto it.
  /** @type {SourceController} */
  const sourceController = {};

  const pushSourceState = () => {
    if (sourceController.setState) {
      sourceController.setState(
        harden({
          value: sourceValue,
          disabled,
        }),
      );
    }
  };

  /**
   * Get parsed data from all rows.
   * @param {boolean} [includeCursor] - Include cursor position
   * @returns {ParsedEval}
   */
  const getData = (includeCursor = false) => {
    const endowments = endowmentRows
      .filter(row => row.getPetName().trim())
      .map(row => ({
        petName: row.getPetName().trim(),
        codeName:
          row.getCodeName().trim() || toJsIdentifier(row.getPetName().trim()),
      }));

    /** @type {ParsedEval} */
    const result = {
      source: sourceValue.trim(),
      endowments,
    };

    if (includeCursor) {
      // The original passed the source caret position; under confinement there
      // is no caret to read, so the source length is the best available hint.
      result.cursorPosition = sourceValue.length;
    }

    return result;
  };

  /**
   * Check if valid (has at least some source code).
   * @returns {boolean}
   */
  const isValid = () => getData().source.length > 0;

  const updateValidity = () => {
    onValidityChange(isValid());
  };

  /**
   * Focus the source expression input. Rather than re-keying the confined input
   * to re-apply `autofocus` (which the sanitizing renderer does not honor, and
   * whose remount would only steal focus back), focus the real node directly.
   * The input renders confined into `$sourceMount`, which flushes on a later
   * frame, so retry across a few frames until it has mounted.
   */
  const focusSource = () => {
    let attempts = 0;
    const tryFocus = () => {
      const $source = /** @type {HTMLElement | null} */ (
        $sourceMount.querySelector('.inline-eval-input')
      );
      if ($source) {
        $source.focus();
      } else if (attempts < 20) {
        attempts += 1;
        requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
  };

  /**
   * Remove an endowment row and dispose its controller.
   * @param {EndowmentRow} row
   */
  const removeEndowmentRow = row => {
    const idx = endowmentRows.indexOf(row);
    if (idx >= 0) {
      row.dispose();
      row.$row.remove();
      endowmentRows.splice(idx, 1);
      updateValidity();
    }
  };

  /**
   * Create a new endowment row. The pet-name input and its autocomplete menu are
   * host nodes owned by `petNamePathAutocomplete`; the code-name input renders
   * confined into a dedicated mount child.
   *
   * @param {string} [initialPetName]
   * @param {string} [initialCodeName]
   * @returns {EndowmentRow}
   */
  const createEndowmentRow = (initialPetName = '', initialCodeName = '') => {
    const $row = document.createElement('div');
    $row.className = 'inline-eval-endowment-group';

    // Pet name chip (host nodes owned by the autocomplete controller).
    const $chip = document.createElement('div');
    $chip.className = 'inline-eval-chip';

    const $petNameWrapper = document.createElement('div');
    $petNameWrapper.className = 'inline-eval-petname-wrapper';

    const $petName = document.createElement('input');
    $petName.type = 'text';
    $petName.className = 'inline-eval-petname';
    $petName.placeholder = 'petName';
    $petName.value = initialPetName;
    $petName.autocomplete = 'off';
    $petName.dataset.formType = 'other';
    $petName.dataset.lpignore = 'true';

    const $petNameMenu = document.createElement('div');
    $petNameMenu.className = 'inline-petname-menu';

    $petNameWrapper.appendChild($petName);
    $petNameWrapper.appendChild($petNameMenu);
    $chip.appendChild($petNameWrapper);

    const $arrow = document.createElement('span');
    $arrow.className = 'inline-eval-arrow';
    $arrow.textContent = '→';

    // Dedicated mount for the confined code-name input.
    const $codeNameMount = document.createElement('div');
    $codeNameMount.className = 'inline-eval-codename-wrapper';

    $row.appendChild($chip);
    $row.appendChild($arrow);
    $row.appendChild($codeNameMount);

    // Mount the pet-name autocomplete controller imperatively into the row's
    // host nodes (host-node embedding, NOT nested in any vnode tree).
    const autocomplete = petNamePathAutocomplete($petName, $petNameMenu, {
      E,
      powers,
    });

    // Authoritative code-name state for this row.
    let codeNameValue = initialCodeName || toJsIdentifier(initialPetName);
    let codeNameFocusNonce = 0;

    /** @type {CodeNameController} */
    const codeNameController = {};

    const pushCodeNameState = () => {
      const state = harden({
        value: codeNameValue,
        disabled,
        focusNonce: codeNameFocusNonce,
      });
      // Buffer so a render before the effect wires `setState` is not dropped.
      codeNameController.pendingState = state;
      if (codeNameController.setState) {
        codeNameController.setState(state);
      }
    };

    const focusCodeName = () => {
      codeNameFocusNonce += 1;
      pushCodeNameState();
    };

    // Resize the pet-name input declaratively as its value changes.
    const resizePetName = () => {
      $petName.size = fieldSize($petName.value, 'petName');
    };

    const row = {
      $row,
      getPetName: () => $petName.value,
      getCodeName: () => codeNameValue,
      setDisabled: nextDisabled => {
        $petName.disabled = nextDisabled;
        pushCodeNameState();
      },
      focus: () => {
        $petName.focus();
      },
      isMenuVisible: () => autocomplete.isMenuVisible(),
      dispose: () => {
        autocomplete.dispose();
        unmount($codeNameMount);
      },
    };

    // Pet-name input drives the auto-inferred code name, mirroring the original.
    $petName.addEventListener('input', () => {
      resizePetName();
      codeNameValue = toJsIdentifier($petName.value);
      pushCodeNameState();
      updateValidity();
    });

    $petName.addEventListener('keydown', e => {
      // = advances to the code-name field.
      if (e.key === '=') {
        e.preventDefault();
        focusCodeName();
        return;
      }

      // Let the autocomplete handle keys while its menu is visible.
      if (autocomplete.isMenuVisible()) {
        return;
      }

      if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        focusSource();
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
      } else if (e.key === 'Backspace' && $petName.value === '') {
        // Backspace on empty pet name removes this endowment.
        e.preventDefault();
        const idx = endowmentRows.indexOf(row);
        removeEndowmentRow(row);
        if (idx > 0) {
          endowmentRows[idx - 1].focus();
        } else {
          focusSource();
        }
      }
    });

    // Code-name controller callbacks invoked by the confined input.
    codeNameController.onInput = value => {
      codeNameValue = value;
      updateValidity();
    };
    codeNameController.onKeyDown = e => {
      if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        focusSource();
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
      } else if (e.key === 'Backspace' && codeNameValue === '') {
        // Backspace on empty code name goes back to the pet name.
        e.preventDefault();
        row.focus();
      }
    };

    // Render the confined code-name input into its dedicated mount.
    renderConfined(
      h(CodeNameInput, { controller: codeNameController }),
      $codeNameMount,
    );

    resizePetName();
    pushCodeNameState();

    return row;
  };

  /**
   * Add a new endowment row.
   * @param {string} [petName]
   * @param {string} [codeName]
   * @returns {EndowmentRow}
   */
  const addEndowmentRow = (petName = '', codeName = '') => {
    const row = createEndowmentRow(petName, codeName);
    endowmentRows.push(row);
    $endowmentsContainer.appendChild(row.$row);
    return row;
  };

  /** @param {string} value */
  const onSourceInput = value => {
    // Typing `@` at the start spawns a new endowment and focuses it.
    if (value.startsWith('@')) {
      sourceValue = value.slice(1);
      pushSourceState();
      const row = addEndowmentRow();
      row.focus();
      updateValidity();
      return;
    }
    sourceValue = value;
    updateValidity();
  };

  /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
  const onSourceKeyDown = e => {
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
    } else if (e.key === 'Backspace' && sourceValue === '') {
      // Backspace at the start of an empty source deletes the last endowment or
      // cancels command mode.
      if (endowmentRows.length > 0) {
        e.preventDefault();
        const last = endowmentRows[endowmentRows.length - 1];
        removeEndowmentRow(last);
        if (endowmentRows.length > 0) {
          endowmentRows[endowmentRows.length - 1].focus();
        }
      } else {
        e.preventDefault();
        onCancel();
      }
    }
  };

  renderConfined(
    h(Root, {
      controller: sourceController,
      initialState: { value: sourceValue, disabled },
      onInput: onSourceInput,
      onKeyDown: onSourceKeyDown,
    }),
    $sourceMount,
  );

  /**
   * Clear all fields.
   */
  const clear = () => {
    for (const row of endowmentRows) {
      row.dispose();
      row.$row.remove();
    }
    endowmentRows.length = 0;
    sourceValue = '';
    pushSourceState();
    updateValidity();
  };

  /**
   * Focus the source input (or first endowment if present).
   */
  const focus = () => {
    if (endowmentRows.length > 0) {
      endowmentRows[0].focus();
    } else {
      focusSource();
    }
  };

  /**
   * Set data from modal or history.
   * @param {ParsedEval} data
   */
  const setData = data => {
    clear();
    for (const endowment of data.endowments) {
      addEndowmentRow(endowment.petName, endowment.codeName);
    }
    sourceValue = data.source;
    pushSourceState();
    updateValidity();
  };

  /**
   * Disable or enable all fields.
   * @param {boolean} nextDisabled
   */
  const setDisabled = nextDisabled => {
    disabled = nextDisabled;
    pushSourceState();
    for (const row of endowmentRows) {
      row.setDisabled(nextDisabled);
    }
  };

  /**
   * Clean up.
   */
  const dispose = () => {
    for (const row of endowmentRows) {
      row.dispose();
    }
    endowmentRows.length = 0;
    unmount($sourceMount);
    $container.innerHTML = '';
  };

  // Initial validity.
  updateValidity();

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
harden(createInlineEval);
