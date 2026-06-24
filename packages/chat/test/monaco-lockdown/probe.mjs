// Browser fixture: prove monaco-editor runs under SES lockdown with the
// `overrideTaming: 'severe'` level that `@endo/preact-container` requires.
//
// Load order mirrors monaco-wrapper.js exactly: `import 'ses'` installs
// `lockdown`, we freeze the realm, and only THEN dynamic-import monaco, so
// monaco's module body and editor creation run against frozen primordials.
//
// This fixture exposes the editor + monaco on globalThis so the Playwright
// runner can drive real RUNTIME interaction (typing, undo/redo, find,
// multi-cursor); first-load compatibility is necessary but not sufficient.

import 'ses';

lockdown({ overrideTaming: 'severe' });

// Record in-page errors too — some monaco failures are swallowed/handled
// and only surface as unhandledrejection or window 'error'.
globalThis.__monacoErrors = [];
window.addEventListener('error', e => {
  globalThis.__monacoErrors.push(`error: ${e.message}`);
});
window.addEventListener('unhandledrejection', e => {
  globalThis.__monacoErrors.push(
    `unhandledrejection: ${e.reason && e.reason.message ? e.reason.message : String(e.reason)}`,
  );
});

(async () => {
  try {
    globalThis.MonacoEnvironment = { getWorker: () => null };
    const monaco = await import('monaco-editor');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    const el = document.getElementById('app');
    const editor = monaco.editor.create(el, {
      value: 'const x = 1;\nconsole.log(x);\n',
      language: 'javascript',
      automaticLayout: true,
      minimap: { enabled: false },
      // exercise auto-closing/auto-indent code paths that mutate model state
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoIndent: 'full',
    });

    globalThis.__monaco = monaco;
    globalThis.__editor = editor;
    globalThis.__ready = true;
  } catch (e) {
    globalThis.__monacoResult = {
      ok: false,
      phase: 'load',
      error: `${e.name}: ${e.message}`,
      stack: String(e.stack).slice(0, 600),
    };
    globalThis.__ready = true;
  }
})();
