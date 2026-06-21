// @ts-check
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** @import { DialogRequest } from './types.js' */

/**
 * The modal prompt overlay. A faithful Preact reimplementation of the
 * imperative `openDialog` markup + behavior (`../file-explorer.js` L557–660);
 * reuses the same `fx-*` classes and DOM nesting verbatim.
 *
 * Renders nothing when `dialog` is null. Otherwise shows the title, an optional
 * message, an optional single text input (focused + selected on open; Enter
 * confirms), an optional radio `choices` group (first checked), and the
 * Cancel / confirm actions. Cancel, a backdrop click, or Escape resolve with
 * `null`. Confirm resolves with: the trimmed input value (when an input is
 * present), the checked radio `value` (when choices are present), or `''` for a
 * plain confirm.
 *
 * The store owns the `DialogRequest.resolve`; this component reports the
 * outcome through `onSubmit`, which the parent wires to `actions.submitDialog`.
 *
 * @param {object} props
 * @param {DialogRequest | null} props.dialog
 * @param {(value: string | null) => void} props.onSubmit
 * @returns {import('preact').VNode | null}
 */
export function Dialog({ dialog, onSubmit }) {
  const options = dialog && dialog.options;

  // Controlled form state for the optional text input and radio choices, so the
  // outcome is read from state rather than queried out of the DOM. Seeded from
  // the request; the parent keys this component on the request id so a new
  // dialog remounts and re-seeds these (an object prop can't be a confined
  // component's effect dependency — the sanitizing renderer reissues its
  // identity every render, so keying an effect on `dialog` would re-run, and
  // re-seed, on every keystroke).
  const [inputValue, setInputValue] = useState(
    (options && options.input && options.input.value) || '',
  );
  const [choiceValue, setChoiceValue] = useState(
    (options &&
      options.choices &&
      options.choices[0] &&
      options.choices[0].value) ||
      null,
  );

  // Focus + select the text input on open. The component is remounted per
  // request (keyed on the dialog id), so this mount-only effect fires once per
  // dialog. Refs are stripped by the sanitizing renderer, so focusing the
  // freshly-rendered input still reaches through the document.
  useEffect(() => {
    if (!options || !options.input) return;
    if (typeof document === 'undefined') return;
    const $input = /** @type {HTMLInputElement | null} */ (
      document.querySelector('.fx-dialog-input')
    );
    if ($input) {
      $input.focus();
      $input.select();
    }
  }, []);

  if (!options) return null;

  /**
   * Resolve the dialog outcome from the controlled form state, mirroring the
   * imperative `confirm()`: trimmed input value > checked radio value > `''`.
   */
  const confirm = () => {
    if (options.input) {
      onSubmit(inputValue.trim());
      return;
    }
    if (options.choices && options.choices.length > 0) {
      onSubmit(choiceValue);
      return;
    }
    onSubmit('');
  };

  const message = options.message
    ? h('div', { class: 'fx-dialog-message' }, options.message)
    : null;

  const input = options.input
    ? h(
        'label',
        { class: 'fx-dialog-field' },
        h('span', {}, options.input.label),
        h('input', {
          type: 'text',
          class: 'fx-dialog-input',
          placeholder: options.input.placeholder || '',
          value: inputValue,
          /** @param {Event} e */
          onInput: e =>
            setInputValue(/** @type {HTMLInputElement} */ (e.target).value),
          /** @param {KeyboardEvent} e */
          onKeyDown: e => {
            if (e.key === 'Enter') {
              confirm();
            }
          },
        }),
      )
    : null;

  const choices =
    options.choices && options.choices.length > 0
      ? h(
          'div',
          { class: 'fx-dialog-choices' },
          ...options.choices.map(choice =>
            h(
              'label',
              { class: 'fx-dialog-choice' },
              h('input', {
                type: 'radio',
                name: 'fx-dialog-choice',
                value: choice.value,
                checked: choice.value === choiceValue,
                onChange: () => setChoiceValue(choice.value),
              }),
              h('span', {}, choice.label),
            ),
          ),
        )
      : null;

  const actions = h(
    'div',
    { class: 'fx-dialog-actions' },
    h(
      'button',
      {
        type: 'button',
        class: 'fx-btn fx-dialog-cancel',
        onClick: () => onSubmit(null),
      },
      'Cancel',
    ),
    h(
      'button',
      {
        type: 'button',
        class: `fx-btn fx-primary ${
          options.danger ? 'fx-danger ' : ''
        }fx-dialog-confirm`,
        onClick: () => confirm(),
      },
      options.confirmLabel || 'OK',
    ),
  );

  return h(
    'div',
    {
      class: 'fx-dialog-overlay',
      // Backdrop click (and Escape) cancel. Inner clicks/keys are stopped on
      // the dialog box below so they never reach this handler.
      onClick: () => onSubmit(null),
      /** @param {KeyboardEvent} e */
      onKeyDown: e => {
        if (e.key === 'Escape') onSubmit(null);
      },
    },
    h(
      'div',
      {
        class: 'fx-dialog',
        // Stop inner clicks from bubbling to the overlay's cancel handler so a
        // click on the dialog body is not treated as a backdrop dismissal.
        /** @param {MouseEvent} e */
        onClick: e => e.stopPropagation(),
      },
      h('div', { class: 'fx-dialog-title' }, options.title),
      message,
      input,
      choices,
      actions,
    ),
  );
}
harden(Dialog);
