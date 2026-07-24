// @ts-nocheck
/* eslint-disable no-underscore-dangle */

// Test stub for ./monaco-wrapper.js. A real Monaco editor needs DOM layout that
// happy-dom does not provide and the `monaco-editor` package is not installed in
// this workspace, so the define-form/eval-form/etc. component tests redirect the
// `monaco-wrapper.js` specifier to this module via a Node loader
// (test/helpers/monaco-loader.mjs). It implements the same MonacoEditorAPI
// surface the forms use, backed by a plain host `<div>` and a string buffer, so
// the confined chrome, the host-node embedding, and submit can all be exercised
// without real Monaco.
//
// The created editors are recorded on globalThis.__monacoStubEditors__ so a test
// can assert dispose() was called.

if (!globalThis.__monacoStubEditors__) {
  globalThis.__monacoStubEditors__ = [];
}

export const detectTheme = () => 'endo-light';

export const createMonacoEditor = async ($container, { onChange } = {}) => {
  const $editorDiv = globalThis.document.createElement('div');
  $editorDiv.className = 'monaco-editor-mount';
  $container.appendChild($editorDiv);

  let value = '';
  let readOnly = false;
  let disposed = false;
  /** @type {(() => void) | null} */
  let addEndowmentCallback = null;

  const api = {
    getValue: () => value,
    setValue: next => {
      value = next ?? '';
      if (onChange) onChange(value);
    },
    setCursorPosition: () => {},
    setReadOnly: ro => {
      readOnly = !!ro;
    },
    focus: () => {},
    dispose: () => {
      disposed = true;
      $editorDiv.remove();
    },
    onAddEndowment: callback => {
      addEndowmentCallback = callback;
    },
    setLanguage: () => {},
    onDidScrollChange: () => {},
    setScrollFraction: () => {},
    // ── Test affordances (not part of the real API) ──
    __setValueFromUser: next => {
      value = next ?? '';
      if (onChange) onChange(value);
    },
    __triggerAddEndowment: () => {
      if (addEndowmentCallback) addEndowmentCallback();
    },
    __isDisposed: () => disposed,
    __isReadOnly: () => readOnly,
    __host: $editorDiv,
  };

  globalThis.__monacoStubEditors__.push(api);
  return api;
};

export const colorize = async text => text;
