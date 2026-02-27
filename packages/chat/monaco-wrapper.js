// @ts-check
/* global document, window, setTimeout, clearTimeout */

/**
 * @typedef {object} MonacoEditorAPI
 * @property {() => string} getValue - Get the editor content
 * @property {(value: string) => void} setValue - Set the editor content
 * @property {(line: number, column: number) => void} setCursorPosition - Set cursor position (1-indexed)
 * @property {(readOnly: boolean) => void} setReadOnly - Set the editor read-only state
 * @property {() => void} focus - Focus the editor
 * @property {() => void} dispose - Dispose the editor
 * @property {(callback: () => void) => void} onAddEndowment - Register callback for Cmd+E
 */

/**
 * Create a Monaco editor instance inside an iframe (to avoid SES conflicts).
 *
 * @param {HTMLElement} $container - Container element for the editor
 * @param {object} options
 * @param {(value: string) => void} options.onChange - Called when content changes
 * @param {string} [options.initialValue] - Initial editor content
 * @param {boolean} [options.darkMode] - Use dark theme
 * @returns {Promise<MonacoEditorAPI>}
 */
export const createMonacoEditor = async (
  $container,
  { onChange, initialValue = '', darkMode = false },
) => {
  // Create iframe for Monaco (isolates it from SES)
  const $iframe = document.createElement('iframe');
  $iframe.src = '/monaco-iframe.html';
  // CSS handles sizing - see .eval-editor-container iframe
  $container.appendChild($iframe);

  let currentValue = initialValue;
  /** @type {(() => void) | null} */
  let addEndowmentCallback = null;

  // Wait for iframe to be ready (with timeout)
  await new Promise((resolve, reject) => {
    let timeout;
    const handleMessage = (/** @type {MessageEvent} */ event) => {
      if (event.data?.type === 'monaco-ready') {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        resolve(undefined);
      }
    };

    timeout = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Monaco editor failed to load within 10 seconds'));
    }, 10000);
    window.addEventListener('message', handleMessage);
  });

  // Set initial value
  if (initialValue) {
    $iframe.contentWindow?.postMessage(
      { type: 'set-value', value: initialValue },
      '*',
    );
  }

  // Handle messages from iframe
  const messageHandler = (/** @type {MessageEvent} */ event) => {
    switch (event.data?.type) {
      case 'monaco-change':
        currentValue = event.data.value;
        onChange(event.data.value);
        break;
      case 'monaco-add-endowment':
        if (addEndowmentCallback) {
          addEndowmentCallback();
        }
        break;
      case 'monaco-submit':
        $container.dispatchEvent(new CustomEvent('monaco-submit'));
        break;
      case 'monaco-escape':
        $container.dispatchEvent(new CustomEvent('monaco-escape'));
        break;
      case 'monaco-focus-name':
        $container.dispatchEvent(new CustomEvent('monaco-focus-name'));
        break;
      default:
        break;
    }
  };
  window.addEventListener('message', messageHandler);

  return {
    getValue: () => currentValue,
    setValue: value => {
      currentValue = value ?? '';
      $iframe.contentWindow?.postMessage(
        { type: 'set-value', value: currentValue },
        '*',
      );
    },
    setCursorPosition: (line, column) => {
      $iframe.contentWindow?.postMessage(
        { type: 'set-cursor', line, column },
        '*',
      );
    },
    setReadOnly: readOnly => {
      $iframe.contentWindow?.postMessage(
        { type: 'set-readonly', value: readOnly },
        '*',
      );
    },
    focus: () => {
      $iframe.contentWindow?.postMessage({ type: 'focus' }, '*');
    },
    dispose: () => {
      window.removeEventListener('message', messageHandler);
      $iframe.remove();
    },
    onAddEndowment: callback => {
      addEndowmentCallback = callback;
    },
  };
};
