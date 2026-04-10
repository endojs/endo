// @ts-check

/**
 * Lightweight DOM Document and Element classes.
 *
 * Builds a tree from the token stream produced by the tokenizer and
 * supports querySelector / querySelectorAll with the selector engine.
 *
 * @module
 */

import { tokenize } from './tokenizer.js';
import { parseSelector, matchesCompound } from './selector.js';

// ─── ClassList ────────────────────────────────────────────────────

/**
 * Minimal classList implementation backed by the class attribute.
 */
class DomClassList {
  /** @type {Set<string>} */
  #classes;

  /** @param {string} classAttr */
  constructor(classAttr) {
    this.#classes = new Set(
      classAttr ? classAttr.split(/\s+/).filter(c => c.length > 0) : [],
    );
  }

  /**
   * @param {string} cls
   * @returns {boolean}
   */
  contains(cls) {
    return this.#classes.has(cls);
  }
}
harden(DomClassList);

// ─── DomNode (base) ──────────────────────────────────────────────

/**
 * Base class for all DOM nodes (Element and Text).
 */
class DomNode {
  /** @type {DomElement | null} */
  parentElement = null;

  /** @type {DomNode[]} */
  childNodes = [];

  /**
   * The concatenated text content of this node and all descendants.
   *
   * @returns {string}
   */
  get textContent() {
    return '';
  }
}
harden(DomNode);

// ─── DomText ─────────────────────────────────────────────────────

/**
 * Text node.
 */
class DomText extends DomNode {
  /** @type {string} */
  #data;

  /** @param {string} data */
  constructor(data) {
    super();
    this.#data = data;
  }

  /** @returns {string} */
  get textContent() {
    return this.#data;
  }
}
harden(DomText);

// ─── DomElement ──────────────────────────────────────────────────

/**
 * Element node with tag name, attributes, children, and query support.
 */
export class DomElement extends DomNode {
  /** @type {string} */
  tagName;

  /** @type {Record<string, string>} */
  #attrs;

  /** @type {DomClassList} */
  classList;

  /**
   * @param {string} tagName
   * @param {Record<string, string>} attrs
   */
  constructor(tagName, attrs) {
    super();
    this.tagName = tagName.toLowerCase();
    this.#attrs = attrs;
    this.classList = new DomClassList(attrs.class || '');

    // Expose common attribute shortcuts used by consuming code.
    // These mirror the browser DOM convenience properties.
  }

  /** @returns {string} */
  get id() {
    return this.#attrs.id || '';
  }

  /** @returns {string} */
  get className() {
    return this.#attrs.class || '';
  }

  /** @returns {string} */
  get href() {
    return this.#attrs.href || '';
  }

  /** @returns {string} */
  get src() {
    return this.#attrs.src || '';
  }

  /**
   * @param {string} name
   * @returns {string | null}
   */
  getAttribute(name) {
    const lower = name.toLowerCase();
    if (lower in this.#attrs) {
      return this.#attrs[lower];
    }
    return null;
  }

  /** @returns {string} */
  get textContent() {
    let text = '';
    for (const child of this.childNodes) {
      text += child.textContent;
    }
    return text;
  }

  /** @returns {DomElement[]} */
  get children() {
    return /** @type {DomElement[]} */ (
      this.childNodes.filter(n => n instanceof DomElement)
    );
  }

  /**
   * Collect all descendant elements in document order.
   *
   * @returns {DomElement[]}
   */
  #allDescendants() {
    /** @type {DomElement[]} */
    const result = [];
    /** @type {DomNode[]} */
    const stack = [...this.childNodes];
    while (stack.length > 0) {
      const node = /** @type {DomNode} */ (stack.shift());
      if (node instanceof DomElement) {
        result.push(node);
        // Push children to front for depth-first document-order.
        stack.unshift(...node.childNodes);
      }
    }
    return result;
  }

  /**
   * @param {string} selector
   * @returns {DomElement[]}
   */
  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    const descendants = this.#allDescendants();
    /** @type {DomElement[]} */
    const matched = [];
    /** @type {Set<DomElement>} */
    const seen = new Set();
    for (const compound of groups) {
      for (const el of descendants) {
        if (!seen.has(el) && matchesCompound(compound, el)) {
          seen.add(el);
          matched.push(el);
        }
      }
    }
    return matched;
  }

  /**
   * @param {string} selector
   * @returns {DomElement | null}
   */
  querySelector(selector) {
    const groups = parseSelector(selector);
    const descendants = this.#allDescendants();
    for (const compound of groups) {
      for (const el of descendants) {
        if (matchesCompound(compound, el)) {
          return el;
        }
      }
    }
    return null;
  }

  /**
   * @param {string} tagName
   * @returns {DomElement[]}
   */
  getElementsByTagName(tagName) {
    const lower = tagName.toLowerCase();
    return this.#allDescendants().filter(
      el => lower === '*' || el.tagName === lower,
    );
  }

  /**
   * @param {string} className
   * @returns {DomElement[]}
   */
  getElementsByClassName(className) {
    return this.#allDescendants().filter(el =>
      el.classList.contains(className),
    );
  }

  /**
   * @param {string} id
   * @returns {DomElement | null}
   */
  getElementById(id) {
    return this.#allDescendants().find(el => el.id === id) || null;
  }

  /**
   * Append a child node.
   *
   * @param {DomNode} child
   */
  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
  }
}
harden(DomElement);

// ─── DomDocument ─────────────────────────────────────────────────

/**
 * Document node — the root of a parsed DOM tree.
 * Delegates query methods to the documentElement.
 */
export class DomDocument extends DomElement {
  /** @type {DomElement | null} */
  #documentElement = null;

  /** @type {DomElement | null} */
  #body = null;

  /** @type {DomElement | null} */
  #head = null;

  constructor() {
    super('#document', {});
  }

  /** @returns {DomElement | null} */
  get documentElement() {
    if (!this.#documentElement) {
      this.#documentElement =
        this.children.find(c => c.tagName === 'html') || null;
    }
    return this.#documentElement;
  }

  /** @returns {DomElement | null} */
  get body() {
    if (!this.#body) {
      const html = this.documentElement;
      if (html) {
        this.#body = html.children.find(c => c.tagName === 'body') || null;
      }
      // Fallback: look anywhere.
      if (!this.#body) {
        this.#body = this.querySelector('body');
      }
    }
    return this.#body;
  }

  /** @returns {DomElement | null} */
  get head() {
    if (!this.#head) {
      const html = this.documentElement;
      if (html) {
        this.#head = html.children.find(c => c.tagName === 'head') || null;
      }
      if (!this.#head) {
        this.#head = this.querySelector('head');
      }
    }
    return this.#head;
  }
}
harden(DomDocument);

// ─── Tree builder ────────────────────────────────────────────────

/**
 * Build a DomDocument from an HTML string.
 *
 * @param {string} html
 * @returns {DomDocument}
 */
export const buildDocument = html => {
  const tokens = tokenize(html);
  const doc = new DomDocument();

  /** @type {DomElement[]} */
  const stack = [doc];

  for (const token of tokens) {
    const parent = stack[stack.length - 1];
    if (token.type === 'open') {
      const el = new DomElement(token.tag, token.attrs);
      parent.appendChild(el);
      if (!token.selfClosing) {
        stack.push(el);
      }
    } else if (token.type === 'close') {
      // Pop up to the matching open tag.
      // Handles implicitly closed tags (e.g. <p> inside <p>).
      let found = false;
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === token.tag) {
          stack.length = i;
          found = true;
          break;
        }
      }
      // If not found, silently ignore the close tag (lenient parsing).
      if (!found) {
        // noop
      }
    } else if (token.type === 'text') {
      const textNode = new DomText(token.data);
      parent.appendChild(textNode);
    }
  }

  return doc;
};
harden(buildDocument);
