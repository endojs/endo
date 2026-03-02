// @ts-check
/* global document, window, globalThis */
/* eslint-disable no-bitwise, import/no-unresolved */

import harden from '@endo/harden';
import * as monaco from 'monaco-editor';

// Configure Monaco environment - disable workers to avoid complexity
globalThis.MonacoEnvironment = {
  // @ts-expect-error Monaco allows null to disable workers
  getWorker: () => null,
};

// Disable diagnostics to avoid worker issues
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

// Define custom themes
monaco.editor.defineTheme('endo-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editorLineNumber.foreground': '#57606a',
    'editorLineNumber.activeForeground': '#24292f',
    'editorGutter.background': '#e1e5e9',
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#f8fafc',
  },
});

monaco.editor.defineTheme('endo-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'f87171' },
    { token: 'string', foreground: 'fb923c' },
    { token: 'comment', foreground: '6b7078' },
    { token: 'number', foreground: '60a5fa' },
  ],
  colors: {
    'editorLineNumber.foreground': '#6b7078',
    'editorLineNumber.activeForeground': '#e1e3e6',
    'editorGutter.background': '#18191c',
    'editor.background': '#141517',
    'editor.lineHighlightBackground': '#1a1b1e',
  },
});

/**
 * Detect the active color scheme from the document.
 *
 * @returns {'endo-light' | 'endo-dark'}
 */
export const detectTheme = () => {
  const scheme = document.documentElement.getAttribute('data-scheme');
  if (scheme && scheme.includes('dark')) {
    return 'endo-dark';
  }
  if (scheme === 'light' || scheme === 'high-contrast-light') {
    return 'endo-light';
  }
  // Fall back to system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'endo-dark';
  }
  return 'endo-light';
};
harden(detectTheme);

/**
 * @typedef {object} MonacoEditorAPI
 * @property {() => string} getValue - Get the editor content
 * @property {(value: string) => void} setValue - Set the editor content
 * @property {(line: number, column: number) => void} setCursorPosition - Set cursor position (1-indexed)
 * @property {() => void} focus - Focus the editor
 * @property {() => void} dispose - Dispose the editor
 * @property {(callback: () => void) => void} onAddEndowment - Register callback for Cmd+E
 */

/**
 * Create a Monaco editor instance directly in the container element.
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
  { onChange, initialValue = '', darkMode: _darkMode = false },
) => {
  // Create a div for the editor to mount into
  const $editorDiv = document.createElement('div');
  $editorDiv.className = 'monaco-editor-mount';
  $container.appendChild($editorDiv);

  const editor = monaco.editor.create($editorDiv, {
    value: initialValue,
    language: 'javascript',
    theme: detectTheme(),
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace",
    wordWrap: 'on',
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 12,
    lineNumbersMinChars: 3,
    renderLineHighlight: 'line',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
    padding: {
      top: 8,
      bottom: 8,
    },
  });

  /** @type {(() => void) | null} */
  let addEndowmentCallback = null;

  // Track content changes
  editor.onDidChangeModelContent(() => {
    onChange(editor.getValue());
  });

  // Add keybindings
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
    if (addEndowmentCallback) {
      addEndowmentCallback();
    }
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    $container.dispatchEvent(new CustomEvent('monaco-submit'));
  });

  editor.addCommand(monaco.KeyCode.Escape, () => {
    $container.dispatchEvent(new CustomEvent('monaco-escape'));
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
    $container.dispatchEvent(new CustomEvent('monaco-focus-name'));
  });

  // Respond to system color scheme changes
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      monaco.editor.setTheme(detectTheme());
    });

  // Respond to theme change events dispatched by spaces-gutter
  document.addEventListener('endo-theme-change', () => {
    monaco.editor.setTheme(detectTheme());
  });

  return {
    getValue: () => editor.getValue(),
    setValue: value => {
      editor.setValue(value ?? '');
    },
    setCursorPosition: (line, column) => {
      editor.setPosition({ lineNumber: line, column });
      editor.revealPositionInCenter({ lineNumber: line, column });
    },
    focus: () => {
      editor.focus();
    },
    dispose: () => {
      editor.dispose();
      $editorDiv.remove();
    },
    onAddEndowment: callback => {
      addEndowmentCallback = callback;
    },
  };
};
harden(createMonacoEditor);
