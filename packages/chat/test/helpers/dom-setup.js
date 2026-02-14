// @ts-check
/* global globalThis, setTimeout */

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
