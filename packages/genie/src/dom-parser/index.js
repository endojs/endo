// @ts-check
/* eslint-disable class-methods-use-this */

/**
 * DOMParser — Node.js-compatible HTML parser.
 *
 * Provides a `DOMParser` class whose `parseFromString(html, mimeType)`
 * method returns a `DomDocument` with querySelector / querySelectorAll
 * support, textContent, and attribute access — sufficient to replace
 * the browser-native `DOMParser` in server-side code.
 *
 * @module
 */

import harden from '@endo/harden';

import { buildDocument, DomDocument, DomElement } from './document.js';

export { DomDocument, DomElement };
export { tokenize } from './tokenizer.js';
export { parseSelector, matchesCompound } from './selector.js';

/**
 * Minimal DOMParser compatible with the browser API surface used
 * by this project.
 */
export class DOMParser {
  /**
   * Parse an HTML or XML string into a DomDocument.
   *
   * @param {string} content - The markup string.
   * @param {string} _type - MIME type (e.g. 'text/html'). Currently
   *   only HTML parsing is implemented.
   * @returns {DomDocument}
   */
  parseFromString(content, _type) {
    return buildDocument(content);
  }
}
harden(DOMParser);
