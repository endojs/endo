// @ts-check
/* eslint-disable no-bitwise, import/no-unresolved */

/**
 * @typedef {object} MonacoEditorAPI
 * @property {() => string} getValue - Get the editor content
 * @property {(value: string) => void} setValue - Set the editor content
 * @property {() => void} focus - Focus the editor
 * @property {() => void} dispose - Dispose the editor
 * @property {(callback: () => void) => void} onAddEndowment - Register callback for Cmd+E
 */

/** @type {Promise<typeof import('monaco-editor')> | null} */
let monacoPromise = null;

/**
 * Lazy load Monaco editor.
 * @returns {Promise<typeof import('monaco-editor')>}
 */
export const loadMonaco = async () => {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then(monaco => {
      // Configure JavaScript/TypeScript defaults for SES environment
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        strict: true,
        noEmit: true,
      });

      // Add SES/Endo global type definitions
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        `
        /** Eventual send - call methods on remote objects */
        declare const E: {
          <T>(target: T): T;
          get<T>(target: T): T;
          sendOnly<T>(target: T): T;
        };

        /** Make an object deeply immutable */
        declare function harden<T>(obj: T): T;

        /** The Hardened JavaScript (SES) global compartment */
        declare const Compartment: any;

        /** Create a promise kit with { promise, resolve, reject } */
        declare function makePromiseKit<T>(): {
          promise: Promise<T>;
          resolve: (value: T) => void;
          reject: (reason: any) => void;
        };
        `,
        'endo-globals.d.ts',
      );

      return monaco;
    });
  }
  return monacoPromise;
};

/**
 * Create a Monaco editor instance.
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
  const monaco = await loadMonaco();

  // Define custom theme with distinct gutter background
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
    rules: [],
    colors: {
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editorGutter.background': '#0d1117',
      'editor.background': '#1e1e1e',
      'editor.lineHighlightBackground': '#161b22',
    },
  });

  const editor = monaco.editor.create($container, {
    value: initialValue,
    language: 'javascript',
    theme: darkMode ? 'endo-dark' : 'endo-light',
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

  // Track content changes
  editor.onDidChangeModelContent(() => {
    onChange(editor.getValue());
  });

  /** @type {(() => void) | null} */
  let addEndowmentCallback = null;

  // Add Cmd+E keybinding for adding endowments
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
    if (addEndowmentCallback) {
      addEndowmentCallback();
    }
  });

  // Add Cmd+Enter keybinding (will be handled by parent form)
  // We dispatch a custom event that the form can listen to
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    $container.dispatchEvent(new CustomEvent('monaco-submit'));
  });

  // Add Escape keybinding to exit editor focus
  editor.addCommand(monaco.KeyCode.Escape, () => {
    $container.dispatchEvent(new CustomEvent('monaco-escape'));
  });

  // Add Cmd/Ctrl+N keybinding to focus result name field
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
    $container.dispatchEvent(new CustomEvent('monaco-focus-name'));
  });

  return {
    getValue: () => editor.getValue(),
    setValue: value => editor.setValue(value),
    focus: () => editor.focus(),
    dispose: () => editor.dispose(),
    onAddEndowment: callback => {
      addEndowmentCallback = callback;
    },
  };
};
