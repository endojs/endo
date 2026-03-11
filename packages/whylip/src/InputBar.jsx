// @ts-check
import React, { useState, useCallback } from 'react';

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
    /** @param {React.FormEvent} e */
    e => {
      e.preventDefault();
      if (text.trim() && !disabled) {
        onSend(text.trim());
        setText('');
      }
    },
    [text, disabled, onSend],
  );

  return (
    <form className="whylip-input" onSubmit={handleSubmit}>
      <input
        type="text"
        className="whylip-input-field"
        placeholder="Ask the Primer anything..."
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={disabled}
      />
      <button
        type="submit"
        className="whylip-send-button"
        disabled={disabled || !text.trim()}
      >
        Send
      </button>
    </form>
  );
}
