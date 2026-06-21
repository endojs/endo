// @ts-check
import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';

/**
 * Text input bar for Whylip.
 *
 * @param {object} props
 * @param {(text: string) => void} props.onSend
 * @param {boolean} props.disabled
 */
export function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(
    /** @param {Event} e */
    e => {
      e.preventDefault();
      if (text.trim() && !disabled) {
        onSend(text.trim());
        setText('');
      }
    },
    [text, disabled, onSend],
  );

  return h(
    'form',
    { class: 'whylip-input', onSubmit: handleSubmit },
    h('input', {
      type: 'text',
      class: 'whylip-input-field',
      placeholder: 'Ask the Primer anything...',
      value: text,
      /** @param {Event} e */
      onInput: e => setText(/** @type {HTMLInputElement} */ (e.target).value),
      disabled,
    }),
    h(
      'button',
      {
        type: 'submit',
        class: 'whylip-send-button',
        disabled: disabled || !text.trim(),
      },
      'Send',
    ),
  );
}
harden(InputBar);
