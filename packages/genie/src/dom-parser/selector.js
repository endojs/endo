// @ts-check

/**
 * CSS Selector Parser and Matcher
 *
 * Parses a subset of CSS selectors and matches them against DOM nodes.
 * Supports: tag, class, id, attribute selectors, descendant and child
 * combinators, comma-separated selector lists.
 *
 * @module
 */

/**
 * @typedef {{
 *   tag?: string,
 *   id?: string,
 *   classes: string[],
 *   attrs: Array<{ name: string, op?: string, value?: string }>,
 * }} SimpleSelector
 */

/**
 * A compound selector is a chain of simple selectors with combinators.
 * The first entry has combinator '' (root), subsequent entries use
 * ' ' (descendant) or '>' (child).
 *
 * @typedef {{
 *   combinator: string,
 *   simple: SimpleSelector,
 * }} SelectorPart
 */

/**
 * @typedef {SelectorPart[]} CompoundSelector
 */

/**
 * Test whether a character is CSS whitespace.
 *
 * @param {string} ch
 * @returns {boolean}
 */
const isCssWs = ch =>
  ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/**
 * Parse a single simple selector (tag, #id, .class, [attr]) at position i.
 *
 * @param {string} sel
 * @param {number} i
 * @returns {{ simple: SimpleSelector, pos: number }}
 */
const parseSimpleSelector = (sel, i) => {
  const len = sel.length;
  /** @type {SimpleSelector} */
  const simple = { classes: [], attrs: [] };

  // Tag name.
  if (
    i < len &&
    sel[i] !== '.' &&
    sel[i] !== '#' &&
    sel[i] !== '[' &&
    sel[i] !== '*'
  ) {
    let start = i;
    while (
      i < len &&
      sel[i] !== '.' &&
      sel[i] !== '#' &&
      sel[i] !== '[' &&
      sel[i] !== ' ' &&
      sel[i] !== '>' &&
      sel[i] !== ','
    ) {
      i += 1;
    }
    simple.tag = sel.slice(start, i).toLowerCase();
  } else if (i < len && sel[i] === '*') {
    i += 1; // universal — no tag filter
  }

  // Additional specifiers: .class, #id, [attr].
  while (i < len) {
    if (sel[i] === '.') {
      i += 1;
      let start = i;
      while (
        i < len &&
        sel[i] !== '.' &&
        sel[i] !== '#' &&
        sel[i] !== '[' &&
        sel[i] !== ' ' &&
        sel[i] !== '>' &&
        sel[i] !== ','
      ) {
        i += 1;
      }
      simple.classes.push(sel.slice(start, i));
    } else if (sel[i] === '#') {
      i += 1;
      let start = i;
      while (
        i < len &&
        sel[i] !== '.' &&
        sel[i] !== '#' &&
        sel[i] !== '[' &&
        sel[i] !== ' ' &&
        sel[i] !== '>' &&
        sel[i] !== ','
      ) {
        i += 1;
      }
      simple.id = sel.slice(start, i);
    } else if (sel[i] === '[') {
      i += 1;
      // Skip whitespace.
      while (i < len && isCssWs(sel[i])) i += 1;
      let nameStart = i;
      while (i < len && sel[i] !== '=' && sel[i] !== ']' && sel[i] !== '~' && sel[i] !== '|' && sel[i] !== '^' && sel[i] !== '$' && sel[i] !== '*') {
        i += 1;
      }
      const name = sel.slice(nameStart, i).trim().toLowerCase();
      if (i < len && sel[i] === ']') {
        // Presence check.
        simple.attrs.push({ name });
        i += 1;
      } else {
        // Operator.
        let op = '';
        if (sel[i] === '=') {
          op = '=';
          i += 1;
        } else if (i + 1 < len && sel[i + 1] === '=') {
          op = sel[i] + '=';
          i += 2;
        } else {
          op = '=';
          i += 1;
        }
        // Skip whitespace.
        while (i < len && isCssWs(sel[i])) i += 1;
        let value = '';
        if (i < len && (sel[i] === '"' || sel[i] === "'")) {
          const q = sel[i];
          i += 1;
          let vs = i;
          while (i < len && sel[i] !== q) i += 1;
          value = sel.slice(vs, i);
          if (i < len) i += 1;
        } else {
          let vs = i;
          while (i < len && sel[i] !== ']' && !isCssWs(sel[i])) i += 1;
          value = sel.slice(vs, i);
        }
        // Skip to ']'.
        while (i < len && sel[i] !== ']') i += 1;
        if (i < len) i += 1;
        simple.attrs.push({ name, op, value });
      }
    } else {
      break;
    }
  }

  return { simple, pos: i };
};

/**
 * Parse a compound selector (parts joined by combinators).
 *
 * @param {string} sel - A single selector (no commas).
 * @returns {CompoundSelector}
 */
const parseCompound = sel => {
  /** @type {CompoundSelector} */
  const parts = [];
  let i = 0;
  const len = sel.length;

  // Skip leading whitespace.
  while (i < len && isCssWs(sel[i])) i += 1;

  // First part has empty combinator (anchor).
  const first = parseSimpleSelector(sel, i);
  parts.push({ combinator: '', simple: first.simple });
  i = first.pos;

  while (i < len) {
    // Determine combinator.
    let hadWhitespace = false;
    while (i < len && isCssWs(sel[i])) {
      hadWhitespace = true;
      i += 1;
    }
    if (i >= len) break;

    let combinator = ' ';
    if (sel[i] === '>') {
      combinator = '>';
      i += 1;
      while (i < len && isCssWs(sel[i])) i += 1;
    } else if (!hadWhitespace) {
      // No whitespace and no '>' — still part of previous simple selector.
      // This shouldn't happen if parseSimpleSelector consumed correctly.
      break;
    }

    if (i >= len) break;
    const next = parseSimpleSelector(sel, i);
    parts.push({ combinator, simple: next.simple });
    i = next.pos;
  }

  return parts;
};

/**
 * Parse a full CSS selector string (comma-separated list).
 *
 * @param {string} selector
 * @returns {CompoundSelector[]}
 */
export const parseSelector = selector => {
  const groups = selector.split(',');
  const result = [];
  for (const group of groups) {
    const trimmed = group.trim();
    if (trimmed) {
      result.push(parseCompound(trimmed));
    }
  }
  return harden(result);
};
harden(parseSelector);

/**
 * Test whether a simple selector matches a node.
 *
 * @param {SimpleSelector} simple
 * @param {{ tagName: string, getAttribute: (name: string) => string | null, classList: { contains: (cls: string) => boolean }, id: string }} node
 * @returns {boolean}
 */
const matchesSimple = (simple, node) => {
  if (simple.tag && node.tagName.toLowerCase() !== simple.tag) {
    return false;
  }
  if (simple.id && node.id !== simple.id) {
    return false;
  }
  for (const cls of simple.classes) {
    if (!node.classList.contains(cls)) {
      return false;
    }
  }
  for (const attr of simple.attrs) {
    const val = node.getAttribute(attr.name);
    if (val === null) return false;
    if (attr.op) {
      const target = attr.value || '';
      switch (attr.op) {
        case '=':
          if (val !== target) return false;
          break;
        case '~=':
          if (!val.split(/\s+/).includes(target)) return false;
          break;
        case '|=':
          if (val !== target && !val.startsWith(`${target}-`)) return false;
          break;
        case '^=':
          if (!val.startsWith(target)) return false;
          break;
        case '$=':
          if (!val.endsWith(target)) return false;
          break;
        case '*=':
          if (!val.includes(target)) return false;
          break;
        default:
          return false;
      }
    }
  }
  return true;
};

/**
 * Test whether a node matches a compound selector.
 *
 * @param {CompoundSelector} compound
 * @param {import('./document.js').DomElement} node
 * @returns {boolean}
 */
export const matchesCompound = (compound, node) => {
  // Walk the parts array right-to-left.
  let current = node;
  for (let p = compound.length - 1; p >= 0; p -= 1) {
    const part = compound[p];
    if (p === compound.length - 1) {
      // Rightmost part must match the candidate node.
      if (!matchesSimple(part.simple, current)) return false;
    } else {
      const nextPart = compound[p + 1];
      if (nextPart.combinator === '>') {
        // Child combinator: current must be the parent.
        const parent = current.parentElement;
        if (!parent || !matchesSimple(part.simple, parent)) return false;
        current = parent;
      } else {
        // Descendant combinator: walk up ancestors.
        let ancestor = current.parentElement;
        while (ancestor) {
          if (matchesSimple(part.simple, ancestor)) break;
          ancestor = ancestor.parentElement;
        }
        if (!ancestor) return false;
        current = ancestor;
      }
    }
  }
  return true;
};
harden(matchesCompound);
