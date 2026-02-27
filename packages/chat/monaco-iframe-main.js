// @ts-check
/* global document, window, self */
/* eslint-disable no-restricted-globals, no-bitwise, import/no-unresolved */
// This file runs INSIDE the Monaco iframe, OUTSIDE of SES
// Do not import this from the main application

import * as monaco from 'monaco-editor';

// Configure Monaco environment - disable workers to avoid complexity
self.MonacoEnvironment = {
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
 * Detect the active color scheme from the parent document.
 *
 * @returns {'endo-light' | 'endo-dark'}
 */
const detectTheme = () => {
  // Check for explicit data-scheme on parent document
  try {
    const parentScheme =
      window.parent.document.documentElement.getAttribute('data-scheme');
    if (parentScheme && parentScheme.includes('dark')) {
      return 'endo-dark';
    }
    if (parentScheme === 'light' || parentScheme === 'high-contrast-light') {
      return 'endo-light';
    }
  } catch {
    // Cross-origin; fall through to media query
  }
  // Fall back to system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'endo-dark';
  }
  return 'endo-light';
};

// Create editor
const editor = monaco.editor.create(
  /** @type {HTMLElement} */ (document.getElementById('editor')),
  {
    value: '',
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
  },
);

// Track content changes
editor.onDidChangeModelContent(() => {
  window.parent.postMessage(
    {
      type: 'monaco-change',
      value: editor.getValue(),
    },
    '*',
  );
});

// Add keybindings
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
  window.parent.postMessage({ type: 'monaco-add-endowment' }, '*');
});

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
  window.parent.postMessage({ type: 'monaco-submit' }, '*');
});

editor.addCommand(monaco.KeyCode.Escape, () => {
  window.parent.postMessage({ type: 'monaco-escape' }, '*');
});

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
  window.parent.postMessage({ type: 'monaco-focus-name' }, '*');
});

// Handle messages from parent
window.addEventListener('message', event => {
  const { type, value, line, column } = event.data || {};
  switch (type) {
    case 'set-value':
      editor.setValue(value ?? '');
      break;
    case 'get-value':
      window.parent.postMessage(
        {
          type: 'monaco-value',
          value: editor.getValue(),
        },
        '*',
      );
      break;
    case 'set-cursor':
      editor.setPosition({ lineNumber: line, column });
      editor.revealPositionInCenter({ lineNumber: line, column });
      break;
    case 'set-readonly':
      editor.updateOptions({ readOnly: !!value });
      break;
    case 'focus':
      editor.focus();
      break;
    default:
      break;
  }
});

// Respond to system color scheme changes
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    monaco.editor.setTheme(detectTheme());
  });

// Handle messages from parent
// (extended: respond to scheme-change messages)
window.addEventListener('message', schemeEvent => {
  if (schemeEvent.data && schemeEvent.data.type === 'set-theme') {
    monaco.editor.setTheme(detectTheme());
  }
});

// Signal ready
window.parent.postMessage({ type: 'monaco-ready' }, '*');
