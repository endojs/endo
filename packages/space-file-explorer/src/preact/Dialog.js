// @ts-check
import { h } from 'preact';
import { useEffect } from 'preact/hooks';

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

  // Focus + select the text input when a dialog with an input opens. Refs are
  // stripped by the sanitizing renderer, so reach for the freshly-rendered
  // input through the document rather than a vnode ref. Keyed on the request
  // identity so re-opening a fresh dialog re-focuses.
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
  }, [dialog]);

  if (!options) return null;

  /**
   * Resolve the dialog outcome from the live form, mirroring the imperative
   * `confirm()`: trimmed input value > checked radio value > `''`. Only one
   * dialog is ever open, so a document-scoped lookup is unambiguous (refs are
   * stripped by the sanitizing renderer, so there is no node to scope to).
   */
  const confirm = () => {
    if (typeof document === 'undefined') {
      onSubmit('');
      return;
    }
    const $input = /** @type {HTMLInputElement | null} */ (
      document.querySelector('.fx-dialog-input')
    );
    if ($input) {
      onSubmit($input.value.trim());
      return;
    }
    if (options.choices && options.choices.length > 0) {
      const checked = /** @type {HTMLInputElement | null} */ (
        document.querySelector('input[name="fx-dialog-choice"]:checked')
      );
      onSubmit(checked ? checked.value : null);
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
          value: options.input.value || '',
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
          ...options.choices.map((choice, index) =>
            h(
              'label',
              { class: 'fx-dialog-choice' },
              h('input', {
                type: 'radio',
                name: 'fx-dialog-choice',
                value: choice.value,
                checked: index === 0,
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
