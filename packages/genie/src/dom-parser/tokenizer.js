// @ts-check

/**
 * HTML Tokenizer
 *
 * Converts raw HTML strings into a flat stream of tokens.
 * Handles opening tags (with attributes), closing tags, text nodes,
 * comments, doctypes, void elements, and self-closing tags.
 *
 * @module
 */

/** @typedef {{ type: 'open', tag: string, attrs: Record<string, string>, selfClosing: boolean }} OpenToken */
/** @typedef {{ type: 'close', tag: string }} CloseToken */
/** @typedef {{ type: 'text', data: string }} TextToken */
/** @typedef {OpenToken | CloseToken | TextToken} Token */

/**
 * Set of HTML void elements that have no closing tag.
 *
 * @type {Set<string>}
 */
const VOID_ELEMENTS = harden(
  new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]),
);

/**
 * Set of raw-text elements whose content is not parsed as HTML.
 *
 * @type {Set<string>}
 */
const RAW_TEXT_ELEMENTS = harden(new Set(['script', 'style']));

/**
 * Mapping of common HTML entities to their decoded characters.
 *
 * @type {Record<string, string>}
 */
const ENTITY_MAP = harden({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': '\u00A0',
});

/**
 * Decode HTML entities in a string.
 *
 * Handles named entities from ENTITY_MAP and numeric character
 * references (both decimal &#NNN; and hexadecimal &#xHHH;).
 *
 * @param {string} text
 * @returns {string}
 */
const decodeEntities = text => {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, match => {
    if (ENTITY_MAP[match] !== undefined) {
      return ENTITY_MAP[match];
    }
    // Numeric character reference.
    if (match.startsWith('&#x') || match.startsWith('&#X')) {
      const code = parseInt(match.slice(3, -1), 16);
      return String.fromCodePoint(code);
    }
    if (match.startsWith('&#')) {
      const code = parseInt(match.slice(2, -1), 10);
      return String.fromCodePoint(code);
    }
    // Unknown named entity — return as-is.
    return match;
  });
};
harden(decodeEntities);

/**
 * Test whether a character is whitespace for attribute parsing.
 *
 * @param {string} ch
 * @returns {boolean}
 */
const isWhitespace = ch =>
  ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/**
 * Parse attributes from the portion of a tag string after the tag name.
 *
 * @param {string} attrStr - The raw attribute portion of the tag.
 * @returns {Record<string, string>}
 */
const parseAttributes = attrStr => {
  /** @type {Record<string, string>} */
  const attrs = {};
  let i = 0;
  const len = attrStr.length;

  while (i < len) {
    // Skip whitespace.
    while (i < len && isWhitespace(attrStr[i])) {
      i += 1;
    }
    if (i >= len) break;

    // Read attribute name.
    let nameStart = i;
    while (
      i < len &&
      !isWhitespace(attrStr[i]) &&
      attrStr[i] !== '=' &&
      attrStr[i] !== '>' &&
      attrStr[i] !== '/'
    ) {
      i += 1;
    }
    const name = attrStr.slice(nameStart, i).toLowerCase();
    if (!name) break;

    // Skip whitespace around '='.
    while (i < len && isWhitespace(attrStr[i])) {
      i += 1;
    }

    if (i < len && attrStr[i] === '=') {
      i += 1; // skip '='
      while (i < len && isWhitespace(attrStr[i])) {
        i += 1;
      }

      let value = '';
      if (i < len && (attrStr[i] === '"' || attrStr[i] === "'")) {
        // Quoted value.
        const quote = attrStr[i];
        i += 1;
        const valStart = i;
        while (i < len && attrStr[i] !== quote) {
          i += 1;
        }
        value = attrStr.slice(valStart, i);
        if (i < len) i += 1; // skip closing quote
      } else {
        // Unquoted value.
        const valStart = i;
        while (i < len && !isWhitespace(attrStr[i]) && attrStr[i] !== '>') {
          i += 1;
        }
        value = attrStr.slice(valStart, i);
      }
      attrs[name] = decodeEntities(value);
    } else {
      // Boolean attribute (no value).
      attrs[name] = '';
    }
  }
  return attrs;
};
harden(parseAttributes);

/**
 * Tokenize an HTML string into a stream of tokens.
 *
 * @param {string} html - The raw HTML string.
 * @returns {Token[]}
 */
export const tokenize = html => {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] === '<') {
      // Comment.
      if (html.startsWith('<!--', i)) {
        const endIdx = html.indexOf('-->', i + 4);
        i = endIdx === -1 ? len : endIdx + 3;
        continue;
      }

      // Doctype.
      if (html.startsWith('<!DOCTYPE', i) || html.startsWith('<!doctype', i)) {
        const endIdx = html.indexOf('>', i);
        i = endIdx === -1 ? len : endIdx + 1;
        continue;
      }

      // CDATA (treat like a comment, skip).
      if (html.startsWith('<![CDATA[', i)) {
        const endIdx = html.indexOf(']]>', i + 9);
        i = endIdx === -1 ? len : endIdx + 3;
        continue;
      }

      // Closing tag.
      if (i + 1 < len && html[i + 1] === '/') {
        const endIdx = html.indexOf('>', i + 2);
        if (endIdx === -1) {
          i = len;
          continue;
        }
        const tag = html
          .slice(i + 2, endIdx)
          .trim()
          .toLowerCase();
        if (tag) {
          tokens.push(harden({ type: 'close', tag }));
        }
        i = endIdx + 1;
        continue;
      }

      // Opening tag.
      // Find end of tag — be careful with '>' inside quoted attribute values.
      let j = i + 1;
      let inQuote = '';
      while (j < len) {
        if (inQuote) {
          if (html[j] === inQuote) {
            inQuote = '';
          }
        } else if (html[j] === '"' || html[j] === "'") {
          inQuote = html[j];
        } else if (html[j] === '>') {
          break;
        }
        j += 1;
      }
      if (j >= len) {
        // Malformed — treat rest as text.
        tokens.push(
          harden({ type: 'text', data: decodeEntities(html.slice(i)) }),
        );
        break;
      }

      const tagContent = html.slice(i + 1, j); // everything between < and >
      const selfClosingSlash = tagContent.endsWith('/');
      const content = selfClosingSlash ? tagContent.slice(0, -1) : tagContent;

      // Extract tag name.
      let k = 0;
      while (k < content.length && !isWhitespace(content[k])) {
        k += 1;
      }
      const tag = content.slice(0, k).toLowerCase();
      if (!tag || tag.startsWith('!') || tag.startsWith('?')) {
        // Unusual tag — skip.
        i = j + 1;
        continue;
      }
      const attrStr = content.slice(k);
      const attrs = parseAttributes(attrStr);
      const isVoid = VOID_ELEMENTS.has(tag);
      const isSelfClosing = selfClosingSlash || isVoid;

      tokens.push(
        harden({
          type: 'open',
          tag,
          attrs,
          selfClosing: isSelfClosing,
        }),
      );

      if (isSelfClosing) {
        tokens.push(harden({ type: 'close', tag }));
      }

      i = j + 1;

      // Raw text elements: consume until closing tag.
      if (RAW_TEXT_ELEMENTS.has(tag)) {
        const closePattern = `</${tag}`;
        const rawEnd = html.toLowerCase().indexOf(closePattern, i);
        if (rawEnd !== -1) {
          const rawText = html.slice(i, rawEnd);
          if (rawText) {
            tokens.push(harden({ type: 'text', data: rawText }));
          }
          tokens.push(harden({ type: 'close', tag }));
          i = rawEnd + closePattern.length;
          const gt = html.indexOf('>', i);
          i = gt === -1 ? len : gt + 1;
        }
        // else: unclosed script/style — remaining content is lost.
      }
      continue;
    }

    // Text node.
    const nextTag = html.indexOf('<', i);
    const end = nextTag === -1 ? len : nextTag;
    const text = html.slice(i, end);
    if (text) {
      tokens.push(harden({ type: 'text', data: decodeEntities(text) }));
    }
    i = end;
  }

  return harden(tokens);
};
harden(tokenize);
