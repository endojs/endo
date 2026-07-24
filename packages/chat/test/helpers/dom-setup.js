// @ts-nocheck - happy-dom types incompatible with standard DOM
/* eslint-disable import/no-unresolved */

import { Window } from 'happy-dom';

/**
 * @typedef {object} DOMContext
 * @property {import('happy-dom').Window} window
 * @property {import('happy-dom').Document} document
 * @property {() => void} cleanup
 */

/**
 * Creates a fresh DOM environment for testing.
 *
 * @returns {DOMContext}
 */
export const createDOM = () => {
  const window = new Window({
    url: 'http://localhost:3000',
    width: 1024,
    height: 768,
  });

  const { document } = window;

  // Add minimal global stubs that components expect
  // @ts-expect-error - happy-dom window type
  globalThis.window = window;
  // @ts-expect-error - happy-dom document type
  globalThis.document = document;
  globalThis.setTimeout = window.setTimeout.bind(window);
  globalThis.clearTimeout = window.clearTimeout.bind(window);

  // DOM globals needed by components
  // happy-dom exposes these on the window object
  const w = /** @type {Record<string, unknown>} */ (
    /** @type {unknown} */ (window)
  );
  if (w.Node) globalThis.Node = /** @type {typeof Node} */ (w.Node);
  if (w.NodeFilter)
    globalThis.NodeFilter = /** @type {typeof NodeFilter} */ (w.NodeFilter);
  if (w.KeyboardEvent)
    globalThis.KeyboardEvent = /** @type {typeof KeyboardEvent} */ (
      w.KeyboardEvent
    );
  if (w.Event) globalThis.Event = /** @type {typeof Event} */ (w.Event);
  if (w.HTMLElement)
    globalThis.HTMLElement = /** @type {typeof HTMLElement} */ (w.HTMLElement);
  if (w.CustomEvent)
    globalThis.CustomEvent = /** @type {typeof CustomEvent} */ (w.CustomEvent);

  // Fallback Node constants if not provided by happy-dom
  if (!globalThis.Node) {
    // @ts-expect-error - creating Node stub
    globalThis.Node = {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
      COMMENT_NODE: 8,
      DOCUMENT_NODE: 9,
    };
  }

  // Stub reportError if not present
  if (!window.reportError) {
    // @ts-expect-error - adding reportError
    window.reportError = error => {
      console.error('reportError:', error);
    };
  }

  return {
    // @ts-expect-error - happy-dom types
    window,
    // @ts-expect-error - happy-dom types
    document,
    cleanup: () => {
      window.close();
      // @ts-expect-error - cleanup
      delete globalThis.window;
      // @ts-expect-error - cleanup
      delete globalThis.document;
      // @ts-expect-error - cleanup
      delete globalThis.Node;
      // @ts-expect-error - cleanup
      delete globalThis.NodeFilter;
      // @ts-expect-error - cleanup
      delete globalThis.KeyboardEvent;
      // @ts-expect-error - cleanup
      delete globalThis.Event;
      // @ts-expect-error - cleanup
      delete globalThis.HTMLElement;
      // @ts-expect-error - cleanup
      delete globalThis.CustomEvent;
    },
  };
};

/**
 * Creates a contenteditable div suitable for token autocomplete.
 *
 * @param {import('happy-dom').Document} document
 * @returns {{ $input: HTMLElement, $menu: HTMLElement, $error: HTMLElement }}
 */
export const createInputElements = document => {
  const $input = /** @type {HTMLElement} */ (document.createElement('div'));
  $input.setAttribute('contenteditable', 'true');
  $input.id = 'chat-message';
  document.body.appendChild($input);

  const $menu = /** @type {HTMLElement} */ (document.createElement('div'));
  $menu.className = 'token-menu';
  $menu.id = 'token-menu';
  document.body.appendChild($menu);

  const $error = /** @type {HTMLElement} */ (document.createElement('div'));
  $error.id = 'chat-error';
  document.body.appendChild($error);

  return {
    $input,
    $menu,
    $error,
  };
};

/**
 * Creates a button element.
 *
 * @param {import('happy-dom').Document} document
 * @param {string} id
 * @returns {HTMLElement}
 */
export const createButton = (document, id) => {
  const $button = document.createElement('button');
  $button.id = id;
  document.body.appendChild($button);
  return /** @type {HTMLElement} */ ($button);
};

/**
 * Wait for pending async operations to complete.
 *
 * @param {number} [ms]
 * @returns {Promise<void>}
 */
export const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

/**
 * Poll until `predicate()` returns truthy, then resolve. The confined render
 * flushes asynchronously (rAF + effect flushes), so a fixed `tick(ms)` delay
 * races on a loaded CI runner. Polling the actual condition is robust and as
 * short as the machine allows.
 *
 * A generous ceiling bounds the poll so a render that never completes fails
 * fast with a clear, pointed error instead of hanging the whole (serial) file
 * until AVA's global timeout — which, when the worker also leaks a handle,
 * wedges CI for hours. The bound is wall-clock (`Date.now`, which survives
 * lockdown): a poll-count bound can't fire when the event loop is so starved
 * that `tick` itself stalls and the counter never advances, whereas an elapsed
 * deadline trips on the next resolved poll regardless of how dilated the polls
 * became. The default 20s is far above any legitimate flush (tens of ms) yet
 * well under AVA's per-test timeout, so it never false-fails a real wait but
 * still fails a genuine hang fast. Use this only to wait for a condition that
 * the following assertion checks.
 *
 * @param {() => unknown} predicate
 * @param {number} [step] - Poll interval in ms.
 * @param {number} [timeoutMs] - Wall-clock ceiling before failing.
 * @returns {Promise<void>}
 */
export const waitFor = async (predicate, step = 10, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw Error(
        `waitFor: condition not met within ${timeoutMs}ms: ${predicate}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};
