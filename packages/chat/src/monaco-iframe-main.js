// @ts-check
/* global document, window, self */
/* eslint-disable no-restricted-globals, no-bitwise, import/no-unresolved */
// This file runs INSIDE the Monaco iframe, OUTSIDE of SES
// Do not import this from the main application

import * as monaco from 'monaco-editor';

// Configure Monaco environment - disable workers to avoid complexity
self.MonacoEnvironment = {
  getWorker: () => null,
};

// Disable diagnostics to avoid worker issues
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

// Define custom theme
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

// Create editor
const editor = monaco.editor.create(
  /** @type {HTMLElement} */ (document.getElementById('editor')),
  {
    value: '',
    language: 'javascript',
    theme: 'endo-light',
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
    case 'focus':
      editor.focus();
      break;
    default:
      break;
  }
});

// Signal ready
window.parent.postMessage({ type: 'monaco-ready' }, '*');
