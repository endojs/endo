// @ts-nocheck - Component test documentation only

/**
 * Monaco Wrapper Unit Tests
 *
 * NOTE: Monaco wrapper behavior is tested via Playwright E2E tests in
 * test/e2e/monaco-editor.spec.ts. Unit testing createMonacoEditor is impractical
 * because happy-dom doesn't support Monaco's DOM requirements.
 *
 * This file documents the direct API and CustomEvent protocol for reference.
 */

import 'ses';

import test from 'ava';

// Document the direct API for reference
test('monaco editor API is documented', t => {
  // MonacoEditorAPI shape returned by createMonacoEditor():
  const apiMethods = [
    'getValue',        // () => string
    'setValue',        // (value: string) => void
    'setCursorPosition', // (line: number, column: number) => void
    'focus',          // () => void
    'dispose',        // () => void
    'onAddEndowment', // (callback: () => void) => void
  ];

  // CustomEvents dispatched on $container:
  const containerEvents = [
    'monaco-submit',     // Cmd+Enter pressed
    'monaco-escape',     // Escape pressed
    'monaco-focus-name', // Cmd+N pressed
  ];

  // CustomEvents on document (for theme sync):
  const documentEvents = [
    'endo-theme-change', // dispatched by spaces-gutter after scheme change
  ];

  t.is(apiMethods.length, 6);
  t.is(containerEvents.length, 3);
  t.is(documentEvents.length, 1);
});
