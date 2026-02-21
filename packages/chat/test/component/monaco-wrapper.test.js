// @ts-nocheck - Component test documentation only

/**
 * Monaco Wrapper Unit Tests
 *
 * NOTE: Monaco wrapper behavior is tested via Playwright E2E tests in
 * test/e2e/monaco-editor.spec.ts. Unit testing createMonacoEditor is impractical
 * because happy-dom doesn't support iframes properly.
 *
 * This file documents the message protocol for reference.
 */

import '@endo/init/debug.js';

import test from 'ava';

// Document the message protocol for reference
test('monaco message protocol is documented', t => {
  // Parent -> Iframe messages:
  const parentToIframe = [
    { type: 'set-value', value: 'string' },
    { type: 'get-value' },
    { type: 'set-cursor', line: 1, column: 1 },
    { type: 'focus' },
  ];

  // Iframe -> Parent messages:
  const iframeToParent = [
    { type: 'monaco-ready' },
    { type: 'monaco-change', value: 'string' },
    { type: 'monaco-value', value: 'string' },
    { type: 'monaco-add-endowment' },
    { type: 'monaco-submit' },
    { type: 'monaco-escape' },
    { type: 'monaco-focus-name' },
  ];

  // These serve as documentation
  t.is(parentToIframe.length, 4);
  t.is(iframeToParent.length, 7);
});
