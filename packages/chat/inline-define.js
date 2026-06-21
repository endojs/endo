// @ts-check

import harden from '@endo/harden';

import {
  h,
  renderConfined,
  unmount,
  useEffect,
  useState,
} from './setup-preact-container.js';

// Inline define input, migrated from imperative `innerHTML` DOM to a confined
// Preact component rendered through a single `renderConfined`. The exported
// entry, `createInlineDefine({...})`, keeps its exact options object and the
// hardened control object (`getData`, `isValid`, `setDisabled`, `clear`,
// `focus`, `setData`, `dispose`) so its only caller — inline-command-form.js —
// needs no changes.
//
// The view's whole state (the source expression, the slot rows, the disabled
// flag, and which field should hold focus) lives in Preact state owned by a
// small Root component. The host's control methods reach that state through a
// mutable controller the Root wires up via `useEffect`, exactly as
// profile-popup.js and channel-list.js do.
//
// Every text field is a CONTROLLED input: its `value` is Preact state and its
// `onInput` handler reads the frozen SafeEvent's `target.value`. Keyboard
// handling (Enter / Cmd-Enter / Escape / Tab / Backspace navigation) runs in
// `onKeyDown` off the SafeEvent's `key` / `metaKey` / `ctrlKey`. There are no
// DOM refs: `renderConfined` strips them, so focus is driven declaratively via
// the `autofocus` attribute keyed by a focus nonce (see `Root`) rather than by
// calling `.focus()` on a node.
//
// The original auto-width "sizer" spans measured `offsetWidth` to size each
// input to its content; under confinement we cannot read a node's width, so the
// inputs size themselves declaratively via the `size` attribute (character
// count) instead. The same `.inline-eval-*` CSS classes are reused so the
// styling from index.css continues to apply.

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
 * @typedef {object} SlotState
 * @property {string} codeName
 * @property {string} label
 */

/**
 * @typedef {object} DefineState
 * @property {string} source
 * @property {SlotState[]} slots
 * @property {boolean} disabled
 */

/**
 * A focus target within the view. The `nonce` is bumped on every focus request
 * so that re-targeting the same logical field still re-applies `autofocus`.
 *
 * @typedef {object} FocusTarget
 * @property {'source' | 'codeName' | 'label'} kind
 * @property {number} index - Slot index for codeName/label; ignored for source.
 * @property {number} nonce
 */

/**
 * @typedef {object} DefineController
 * @property {(state: DefineState) => void} [setState]
 * @property {(target: FocusTarget) => void} [setFocusTarget]
 */

/**
 * Derive the parsed, host-facing data from the raw view state. Slots with an
 * empty (trimmed) code name are dropped; a missing label defaults to the code
 * name, matching the original imperative `getData`.
 *
 * @param {DefineState} state
 * @param {number} [cursorPosition] - When provided, included as cursorPosition.
 * @returns {ParsedDefine}
 */
const parseDefine = (state, cursorPosition) => {
  const slots = state.slots
    .filter(s => s.codeName.trim())
    .map(s => ({
      codeName: s.codeName.trim(),
      label: s.label.trim() || s.codeName.trim(),
    }));

  /** @type {ParsedDefine} */
  const result = {
    source: state.source.trim(),
    slots,
  };

  if (cursorPosition !== undefined) {
    result.cursorPosition = cursorPosition;
  }

  return result;
};
harden(parseDefine);

/**
 * Whether the parsed define is submittable: a non-empty source expression.
 *
 * @param {DefineState} state
 * @returns {boolean}
 */
const computeValid = state => parseDefine(state).source.length > 0;
harden(computeValid);

/**
 * The `size` attribute for a content-sized input: the larger of the value and
 * placeholder lengths, with a small floor so an empty field is still tappable.
 *
 * @param {string} value
 * @param {string} placeholder
 * @returns {number}
 */
const fieldSize = (value, placeholder) =>
  Math.max(value.length, placeholder.length, 3) + 1;
harden(fieldSize);

/**
 * A single slot row: a code-name chip, an arrow, and a label input. Both inputs
 * are controlled; keyboard navigation between them and the source mirrors the
 * original imperative handlers.
 *
 * @param {object} props
 * @param {SlotState} props.slot
 * @param {number} props.index
 * @param {boolean} props.disabled
 * @param {FocusTarget} props.focusTarget
 * @param {(index: number, patch: Partial<SlotState>) => void} props.onChange
 * @param {(index: number) => void} props.onRemove
 * @param {(target: Omit<FocusTarget, 'nonce'>) => void} props.onFocusRequest
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onExpand
 * @param {() => void} props.onCancel
 */
const SlotRow = ({
  slot,
  index,
  disabled,
  focusTarget,
  onChange,
  onRemove,
  onFocusRequest,
  onSubmit,
  onExpand,
  onCancel,
}) => {
  const codeNameFocused =
    focusTarget.kind === 'codeName' && focusTarget.index === index;
  const labelFocused =
    focusTarget.kind === 'label' && focusTarget.index === index;

  return h(
    'div',
    { class: 'inline-eval-endowment-group' },
    h(
      'div',
      { class: 'inline-eval-chip' },
      h(
        'div',
        { class: 'inline-eval-petname-wrapper' },
        h('input', {
          // Re-key on the focus nonce so a focus request re-applies autofocus.
          key: codeNameFocused
            ? `codeName-${index}-${focusTarget.nonce}`
            : undefined,
          type: 'text',
          class: 'inline-eval-petname',
          placeholder: 'name',
          value: slot.codeName,
          disabled,
          autocomplete: 'off',
          autofocus: codeNameFocused,
          size: fieldSize(slot.codeName, 'name'),
          'data-form-type': 'other',
          'data-lpignore': 'true',
          /** @param {{ target: { value: string } }} e */
          onInput: e => onChange(index, { codeName: e.target.value }),
          /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
          onKeyDown: e => {
            if (e.key === '=' || e.key === 'Tab' || e.key === ' ') {
              e.preventDefault();
              onFocusRequest({ kind: 'label', index });
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            } else if (e.key === 'Enter') {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                onExpand();
              } else {
                e.preventDefault();
                onSubmit();
              }
            } else if (e.key === 'Backspace' && slot.codeName === '') {
              e.preventDefault();
              onRemove(index);
            }
          },
        }),
      ),
    ),
    h('span', { class: 'inline-eval-arrow' }, '→'),
    h(
      'div',
      { class: 'inline-eval-codename-wrapper' },
      h('input', {
        key: labelFocused ? `label-${index}-${focusTarget.nonce}` : undefined,
        type: 'text',
        class: 'inline-eval-codename',
        placeholder: 'description',
        value: slot.label,
        disabled,
        autocomplete: 'off',
        autofocus: labelFocused,
        size: fieldSize(slot.label, 'description'),
        'data-form-type': 'other',
        'data-lpignore': 'true',
        /** @param {{ target: { value: string } }} e */
        onInput: e => onChange(index, { label: e.target.value }),
        /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
        onKeyDown: e => {
          if (e.key === 'Tab' || e.key === ' ') {
            e.preventDefault();
            onFocusRequest({ kind: 'source', index: 0 });
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter') {
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              onExpand();
            } else {
              e.preventDefault();
              onSubmit();
            }
          } else if (e.key === 'Backspace' && slot.label === '') {
            e.preventDefault();
            onFocusRequest({ kind: 'codeName', index });
          }
        },
      }),
    ),
  );
};
harden(SlotRow);

/**
 * The define view: the slot rows above a controlled source input. Owns no state
 * of its own — all of it is threaded down from `Root`.
 *
 * @param {object} props
 * @param {DefineState} props.state
 * @param {FocusTarget} props.focusTarget
 * @param {(index: number, patch: Partial<SlotState>) => void} props.onSlotChange
 * @param {(index: number) => void} props.onSlotRemove
 * @param {(value: string) => void} props.onSourceInput
 * @param {(target: Omit<FocusTarget, 'nonce'>) => void} props.onFocusRequest
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onExpand
 * @param {() => void} props.onCancel
 */
const DefineView = ({
  state,
  focusTarget,
  onSlotChange,
  onSlotRemove,
  onSourceInput,
  onFocusRequest,
  onSubmit,
  onExpand,
  onCancel,
}) => {
  const sourceFocused = focusTarget.kind === 'source';

  return h(
    'div',
    { class: 'inline-eval-wrapper' },
    h(
      'div',
      { class: 'inline-eval-endowments' },
      state.slots.map((slot, index) =>
        h(SlotRow, {
          key: index,
          slot,
          index,
          disabled: state.disabled,
          focusTarget,
          onChange: onSlotChange,
          onRemove: onSlotRemove,
          onFocusRequest,
          onSubmit,
          onExpand,
          onCancel,
        }),
      ),
    ),
    h('input', {
      key: sourceFocused ? `source-${focusTarget.nonce}` : undefined,
      type: 'text',
      class: 'inline-eval-input',
      placeholder: 'expression...',
      value: state.source,
      disabled: state.disabled,
      autofocus: sourceFocused,
      /** @param {{ target: { value: string } }} e */
      onInput: e => onSourceInput(e.target.value),
      /** @param {{ key?: string, metaKey?: boolean, ctrlKey?: boolean, preventDefault: () => void }} e */
      onKeyDown: e => {
        if (e.key === 'Enter') {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onExpand();
          } else {
            e.preventDefault();
            onSubmit();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (
          e.key === 'Backspace' &&
          state.source === '' &&
          state.slots.length > 0
        ) {
          e.preventDefault();
          onFocusRequest({ kind: 'label', index: state.slots.length - 1 });
        }
      },
    }),
  );
};
harden(DefineView);

/**
 * Root component: a thin renderer. The AUTHORITATIVE view state lives in the
 * host closure (see `createInlineDefine`), not here, so that the host's
 * `getData`/`isValid` always read a synchronously-fresh value rather than
 * racing Preact's deferred effect flush. The component holds only the latest
 * `state`/`focusTarget` the host pushes through the controller, and registers
 * its setters on the controller via `useEffect`.
 *
 * @param {object} props
 * @param {DefineController} props.controller
 * @param {DefineState} props.initialState
 * @param {FocusTarget} props.initialFocus
 * @param {(value: string) => void} props.onSourceInput
 * @param {(index: number, patch: Partial<SlotState>) => void} props.onSlotChange
 * @param {(index: number) => void} props.onSlotRemove
 * @param {(target: Omit<FocusTarget, 'nonce'>) => void} props.onFocusRequest
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onExpand
 * @param {() => void} props.onCancel
 */
const Root = ({
  controller,
  initialState,
  initialFocus,
  onSourceInput,
  onSlotChange,
  onSlotRemove,
  onFocusRequest,
  onSubmit,
  onExpand,
  onCancel,
}) => {
  const [state, setState] = useState(initialState);
  const [focusTarget, setFocusTarget] = useState(initialFocus);

  // Wire the controller so the host can push new state / focus targets.
  // Mount-only: `controller` is a stable bridge; a `[controller]` dep re-runs
  // this effect every render under confinement (the sanitizer reissues the prop
  // identity), needless churn that elsewhere spins a render/effect feedback loop.
  useEffect(() => {
    controller.setState = setState;
    controller.setFocusTarget = setFocusTarget;
    return () => {
      if (controller.setState === setState) delete controller.setState;
      if (controller.setFocusTarget === setFocusTarget) {
        delete controller.setFocusTarget;
      }
    };
  }, []);

  return h(DefineView, {
    state,
    focusTarget,
    onSlotChange,
    onSlotRemove,
    onSourceInput,
    onFocusRequest,
    onSubmit,
    onExpand,
    onCancel,
  });
};
harden(Root);

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
  // Mutable bridge to the root component's state setters (populated by the
  // component's effect). Intentionally NOT hardened — the component writes onto
  // it.
  /** @type {DefineController} */
  const controller = {};

  // The AUTHORITATIVE view state lives here in the host closure, not in the
  // component, so that `getData`/`isValid` are always read synchronously-fresh
  // regardless of when Preact flushes its render and effects. The component
  // mirrors it for display via `controller.setState`.
  /** @type {DefineState} */
  let state = { source: '', slots: [], disabled: false };
  let focusNonce = 0;

  /** @param {DefineState} next */
  const render = next => {
    state = next;
    if (controller.setState) {
      controller.setState(next);
    }
  };

  /** @param {DefineState} next */
  const commit = next => {
    render(next);
    onValidityChange(computeValid(next));
  };

  /** @param {Omit<FocusTarget, 'nonce'>} target */
  const requestFocus = target => {
    focusNonce += 1;
    if (controller.setFocusTarget) {
      controller.setFocusTarget({
        kind: target.kind,
        index: target.index,
        nonce: focusNonce,
      });
    }
  };

  /** @param {string} value */
  const onSourceInput = value => {
    // Typing `@` at the start of the source spawns a new slot and focuses it.
    if (value.startsWith('@')) {
      const next = {
        ...state,
        source: value.slice(1),
        slots: [...state.slots, { codeName: '', label: '' }],
      };
      commit(next);
      requestFocus({ kind: 'codeName', index: next.slots.length - 1 });
      return;
    }
    commit({ ...state, source: value });
  };

  /**
   * @param {number} index
   * @param {Partial<SlotState>} patch
   */
  const onSlotChange = (index, patch) => {
    const slots = state.slots.map((s, i) =>
      i === index ? { ...s, ...patch } : s,
    );
    commit({ ...state, slots });
  };

  /** @param {number} index */
  const onSlotRemove = index => {
    const slots = state.slots.filter((_, i) => i !== index);
    commit({ ...state, slots });
    // Mirror the original Backspace-on-empty navigation: move to the previous
    // slot's label, else back to the source input.
    if (index > 0) {
      requestFocus({ kind: 'label', index: index - 1 });
    } else {
      requestFocus({ kind: 'source', index: 0 });
    }
  };

  const submit = () => {
    if (computeValid(state)) {
      onSubmit(parseDefine(state));
    }
  };

  const expand = () => {
    // The original passed the source caret position; under confinement there is
    // no caret to read, so the source length is the best available cursor hint.
    onExpand(parseDefine(state, state.source.length));
  };

  renderConfined(
    h(Root, {
      controller,
      initialState: state,
      initialFocus: { kind: 'source', index: 0, nonce: 0 },
      onSourceInput,
      onSlotChange,
      onSlotRemove,
      onFocusRequest: requestFocus,
      onSubmit: submit,
      onExpand: expand,
      onCancel,
    }),
    $container,
  );

  /**
   * @param {boolean} [includeCursor]
   * @returns {ParsedDefine}
   */
  const getData = (includeCursor = false) =>
    parseDefine(state, includeCursor ? state.source.length : undefined);

  /** @returns {boolean} */
  const isValid = () => computeValid(state);

  /** @param {boolean} disabled */
  const setDisabled = disabled => {
    render({ ...state, disabled });
  };

  const clear = () => {
    render({ source: '', slots: [], disabled: false });
    onValidityChange(false);
  };

  const focus = () => {
    if (state.slots.length > 0) {
      requestFocus({ kind: 'codeName', index: 0 });
    } else {
      requestFocus({ kind: 'source', index: 0 });
    }
  };

  /** @param {ParsedDefine} data */
  const setData = data => {
    render({
      source: data.source,
      slots: data.slots.map(slot => ({
        codeName: slot.codeName,
        label: slot.label,
      })),
      disabled: false,
    });
    onValidityChange(computeValid(state));
  };

  const dispose = () => {
    unmount($container);
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
harden(createInlineDefine);
