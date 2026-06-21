// @ts-check
/* eslint-disable no-bitwise, import/no-unresolved */
/* global globalThis */

import harden from '@endo/harden';

// monaco-editor is a browser-only package whose ESM entry point is
// not resolvable by Node directly (it has no `main`/`exports`, and
// its internal imports rely on bundler resolution).  We dynamically
// import it so this module can be loaded in Node for component tests
// that never exercise the Monaco-dependent code paths.
/** @type {typeof import('monaco-editor') | undefined} */
let monacoModule;

/** @returns {Promise<typeof import('monaco-editor')>} */
const loadMonaco = async () => {
  if (monacoModule !== undefined) return monacoModule;
  monacoModule = /** @type {typeof import('monaco-editor')} */ (
    await import('monaco-editor')
  );
  const monaco = monacoModule;

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

  // Register a `diff` language. Monaco's basic-languages bundle
  // does NOT ship one, so without this `colorize(text, 'diff')`
  // silently falls back to plain text. The tokenizer matches each
  // line by its leading sigil: `---`/`+++` file headers, `@@`
  // hunk headers, `+`/`-` body lines, and `#` comment lines (used
  // by the file-explorer's layer-diff viewer for "# unchanged"
  // and "# truncated" annotations).
  if (!monaco.languages.getLanguages().some(l => l.id === 'diff')) {
    monaco.languages.register({ id: 'diff' });
    monaco.languages.setMonarchTokensProvider('diff', {
      defaultToken: '',
      tokenizer: {
        root: [
          [/^---.*$/, 'diff.header.deleted'],
          [/^\+\+\+.*$/, 'diff.header.inserted'],
          [/^@@.*@@.*$/, 'diff.range'],
          [/^-.*$/, 'diff.deleted'],
          [/^\+.*$/, 'diff.inserted'],
          [/^#.*$/, 'comment'],
          [/^.*$/, ''],
        ],
      },
    });
  }

  // Define custom themes. The `diff.*` token rules color the
  // language we registered above — red for removed, green for
  // added, purple for hunk ranges, with bolded file-header rows.
  monaco.editor.defineTheme('endo-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'diff.deleted', foreground: 'b91c1c' },
      { token: 'diff.inserted', foreground: '15803d' },
      {
        token: 'diff.header.deleted',
        foreground: 'b91c1c',
        fontStyle: 'bold',
      },
      {
        token: 'diff.header.inserted',
        foreground: '15803d',
        fontStyle: 'bold',
      },
      { token: 'diff.range', foreground: '6b21a8' },
    ],
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
      { token: 'diff.deleted', foreground: 'f87171' },
      { token: 'diff.inserted', foreground: '4ade80' },
      {
        token: 'diff.header.deleted',
        foreground: 'f87171',
        fontStyle: 'bold',
      },
      {
        token: 'diff.header.inserted',
        foreground: '4ade80',
        fontStyle: 'bold',
      },
      { token: 'diff.range', foreground: 'c084fc' },
    ],
    colors: {
      'editorLineNumber.foreground': '#6b7078',
      'editorLineNumber.activeForeground': '#e1e3e6',
      'editorGutter.background': '#18191c',
      'editor.background': '#141517',
      'editor.lineHighlightBackground': '#1a1b1e',
    },
  });

  // Set the initial global theme
  monaco.editor.setTheme(detectTheme());

  // Keep the global theme in sync when the scheme changes
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      monaco.editor.setTheme(detectTheme());
    });
  document.addEventListener('endo-theme-change', () => {
    monaco.editor.setTheme(detectTheme());
  });

  return monaco;
};

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
 * @property {(readOnly: boolean) => void} setReadOnly - Set the editor read-only state
 * @property {() => void} focus - Focus the editor
 * @property {() => void} dispose - Dispose the editor
 * @property {(callback: () => void) => void} onAddEndowment - Register callback for Cmd+E
 * @property {(lang: string) => void} setLanguage - Set the editor language mode
 * @property {(callback: (scrollTop: number, scrollHeight: number) => void) => void} onDidScrollChange - Register scroll change listener
 * @property {(fraction: number) => void} setScrollFraction - Scroll to a proportional position (0–1)
 */

/**
 * Create a Monaco editor instance directly in the container element.
 *
 * @param {HTMLElement} $container - Container element for the editor
 * @param {object} options
 * @param {(value: string) => void} options.onChange - Called when content changes
 * @param {string} [options.initialValue] - Initial editor content
 * @param {boolean} [options.darkMode] - Use dark theme
 * @param {string} [options.language] - Language mode (default: 'javascript')
 * @returns {Promise<MonacoEditorAPI>}
 */
export const createMonacoEditor = async (
  $container,
  {
    onChange,
    initialValue = '',
    darkMode: _darkMode = false,
    language = 'javascript',
  },
) => {
  const monaco = await loadMonaco();
  // Create a div for the editor to mount into
  const $editorDiv = document.createElement('div');
  $editorDiv.className = 'monaco-editor-mount';
  $container.appendChild($editorDiv);

  const editor = monaco.editor.create($editorDiv, {
    value: initialValue,
    language,
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
    setReadOnly: readOnly => {
      editor.updateOptions({ readOnly: !!readOnly });
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
    setLanguage: lang => {
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, lang);
      }
    },
    onDidScrollChange: callback => {
      editor.onDidScrollChange(() => {
        const scrollTop = editor.getScrollTop();
        const scrollHeight = editor.getScrollHeight();
        callback(scrollTop, scrollHeight);
      });
    },
    setScrollFraction: fraction => {
      const scrollHeight = editor.getScrollHeight();
      const clientHeight = editor.getLayoutInfo().height;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      editor.setScrollTop(fraction * maxScroll);
    },
  };
};
harden(createMonacoEditor);

/**
 * Syntax-highlight text without creating a full editor instance.
 *
 * The returned HTML uses CSS classes (mtk1, mtk3, …) whose colors
 * are defined by Monaco's theme service.  The module-level listeners
 * keep the theme in sync, so already-rendered code blocks update
 * automatically when the user switches light/dark.
 *
 * @param {string} text
 * @param {string} language - Monaco language identifier
 * @returns {Promise<string>} HTML string with colorized tokens
 */
export const colorize = async (text, language) => {
  const monaco = await loadMonaco();
  return monaco.editor.colorize(text, language, { tabSize: 2 });
};
harden(colorize);
