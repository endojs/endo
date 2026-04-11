// @ts-check
/* eslint-disable no-continue */

/** @import { Token } from './types.js' */

/**
 * Unicode punctuation pattern (simplified for CommonMark boundary rules).
 */
const PUNCTUATION_RE = /[!-/:-@[-`{-~\u00A1-\u00BF\u2010-\u2027\u2030-\u205E]/;

/**
 * Classify a character for delimiter boundary rules.
 *
 * @param {string} ch - Single character (or '' for start/end of string)
 * @returns {'whitespace' | 'punctuation' | 'other'}
 */
const classifyChar = ch => {
  if (ch === '' || /\s/.test(ch)) {
    return 'whitespace';
  }
  if (PUNCTUATION_RE.test(ch)) {
    return 'punctuation';
  }
  return 'other';
};

/**
 * @typedef {object} InlineNode
 * @property {'text' | 'code' | 'delimiter' | 'link'} kind
 * @property {string} [text]
 * @property {string} [char] - For delimiter nodes
 * @property {number} [count] - For delimiter nodes
 * @property {boolean} [canOpen] - For delimiter nodes
 * @property {boolean} [canClose] - For delimiter nodes
 * @property {Token} [linkToken] - For link nodes
 */

/**
 * Parse inline formatting with CommonMark flanking delimiter rules.
 *
 * @param {string} text - Text to parse
 * @returns {Token[]}
 */
export const parseInline = text => {
  // Phase 1: Tokenize into a flat list of nodes (text, code, delimiters, links)
  /** @type {InlineNode[]} */
  const nodes = tokenize(text);

  // Phase 2: Match delimiter openers to closers
  processDelimiters(nodes);

  // Phase 3: Convert nodes to Token tree
  return nodesToTokens(nodes);
};

/**
 * Count consecutive occurrences of ch starting at position p.
 *
 * @param {string} text
 * @param {string} ch
 * @param {number} p
 * @returns {number}
 */
const countRun = (text, ch, p) => {
  let n = 0;
  while (p + n < text.length && text[p + n] === ch) {
    n += 1;
  }
  return n;
};

/**
 * Phase 1: Tokenize text into a flat node list.
 *
 * @param {string} text
 * @returns {InlineNode[]}
 */
const tokenize = text => {
  /** @type {InlineNode[]} */
  const nodes = [];
  const len = text.length;
  let pos = 0;
  let textBuf = '';

  const flushText = () => {
    if (textBuf) {
      nodes.push({ kind: 'text', text: textBuf });
      textBuf = '';
    }
  };

  while (pos < len) {
    const ch = text[pos];

    // Escape sequences
    if (ch === '\\' && pos + 1 < len && PUNCTUATION_RE.test(text[pos + 1])) {
      textBuf += text[pos + 1];
      pos += 2;
      continue;
    }

    // Backtick code spans
    if (ch === '`') {
      const openLen = countRun(text, '`', pos);
      let searchPos = pos + openLen;
      let found = false;
      while (searchPos < len) {
        const idx = text.indexOf('`', searchPos);
        if (idx === -1) break;
        const closeLen = countRun(text, '`', idx);
        if (closeLen === openLen) {
          flushText();
          let content = text.slice(pos + openLen, idx);
          if (
            content.length >= 2 &&
            content[0] === ' ' &&
            content[content.length - 1] === ' ' &&
            /[^ ]/.test(content)
          ) {
            content = content.slice(1, -1);
          }
          nodes.push({ kind: 'code', text: content });
          pos = idx + closeLen;
          found = true;
          break;
        }
        searchPos = idx + closeLen;
      }
      if (!found) {
        textBuf += text.slice(pos, pos + openLen);
        pos += openLen;
      }
      continue;
    }

    // Links
    if (ch === '[') {
      const linkResult = tryParseLink(text, pos);
      if (linkResult) {
        flushText();
        nodes.push({ kind: 'link', linkToken: linkResult.token });
        pos = linkResult.end;
        continue;
      }
      textBuf += '[';
      pos += 1;
      continue;
    }

    // Emphasis/strong/strikethrough delimiters
    if (ch === '*' || ch === '_' || ch === '~') {
      flushText();
      const runLen = countRun(text, ch, pos);
      const before = pos > 0 ? text[pos - 1] : '';
      const after = pos + runLen < len ? text[pos + runLen] : '';

      const beforeClass = classifyChar(before);
      const afterClass = classifyChar(after);

      // CommonMark flanking rules
      const leftFlanking =
        afterClass !== 'whitespace' &&
        (afterClass !== 'punctuation' || beforeClass !== 'other');
      const rightFlanking =
        beforeClass !== 'whitespace' &&
        (beforeClass !== 'punctuation' || afterClass !== 'other');

      let canOpen = leftFlanking;
      let canClose = rightFlanking;

      // _ intraword restriction
      if (ch === '_') {
        if (leftFlanking && rightFlanking) {
          // Within leftFlanking && rightFlanking, neither class can be
          // 'whitespace', so checking 'punctuation' is sufficient.
          canOpen = beforeClass === 'punctuation';
          canClose = afterClass === 'punctuation';
        }
      }

      nodes.push({
        kind: 'delimiter',
        char: ch,
        count: runLen,
        canOpen,
        canClose,
      });
      pos += runLen;
      continue;
    }

    // Regular character
    textBuf += ch;
    pos += 1;
  }
  flushText();
  return nodes;
};

/**
 * Phase 2: Match delimiter openers to closers using the CommonMark algorithm.
 * Modifies nodes in place: matched delimiters get count reduced,
 * and we insert marker nodes for matched pairs.
 *
 * We process this by scanning for closers, then looking backward for openers.
 *
 * @param {InlineNode[]} nodes
 */
const processDelimiters = nodes => {
  // We process closers left to right
  for (let ci = 0; ci < nodes.length; ci += 1) {
    const closer = nodes[ci];
    if (closer.kind !== 'delimiter' || !closer.canClose || !closer.count) {
      continue;
    }

    // Look backward for a matching opener
    for (let oi = ci - 1; oi >= 0; oi -= 1) {
      const opener = nodes[oi];
      if (
        opener.kind !== 'delimiter' ||
        !opener.canOpen ||
        !opener.count ||
        opener.char !== closer.char
      ) {
        continue;
      }

      // Determine how many delimiters to consume
      // For * and _, use 2 for strong, 1 for emphasis
      // For ~, use 1 or 2 (both = strikethrough)
      const delimChar = opener.char || '';
      let useCount;
      if (delimChar === '~') {
        useCount = Math.min(opener.count, closer.count, 2);
      } else if (opener.count >= 2 && closer.count >= 2) {
        // Prefer to consume 2 for strong if both have >= 2
        useCount = 2;
      } else {
        useCount = 1;
      }

      // Reduce counts
      opener.count -= useCount;
      closer.count -= useCount;

      // Determine type
      let type;
      if (delimChar === '~') {
        type = /** @type {const} */ ('strikethrough');
      } else if (useCount >= 2) {
        type = /** @type {const} */ ('strong');
      } else {
        type = /** @type {const} */ ('emphasis');
      }

      // Extract nodes between opener and closer as children
      const innerNodes = nodes.splice(oi + 1, ci - oi - 1);
      // ci is now shifted; the closer is now at oi + 1
      ci = oi + 1;

      // Convert inner nodes to tokens
      const children = nodesToTokens(innerNodes);

      // Insert a virtual node representing the matched span
      nodes.splice(oi + 1, 0, {
        kind: 'text',
        text: '',
        // Stash the token on the node for extraction later
        linkToken: { type, children },
      });

      // If opener is fully consumed, skip it next time
      // If closer still has count, re-process it
      if (closer.count > 0) {
        // ci now points to the closer which moved to oi + 2
        ci = oi + 1; // Will be incremented by loop
      } else {
        ci = oi + 1;
      }

      break; // Found a match, move on to next closer
    }
  }
};

/**
 * Phase 3: Convert flat node list to Token array.
 *
 * @param {InlineNode[]} nodes
 * @returns {Token[]}
 */
const nodesToTokens = nodes => {
  /** @type {Token[]} */
  const tokens = [];

  for (const node of nodes) {
    switch (node.kind) {
      case 'text': {
        // Check if this is actually a stashed matched span
        if (node.linkToken) {
          tokens.push(node.linkToken);
        } else if (node.text) {
          // Merge with previous text token if possible
          const last = tokens[tokens.length - 1];
          if (last && last.type === 'text') {
            last.content = (last.content || '') + node.text;
          } else {
            tokens.push({ type: 'text', content: node.text });
          }
        }
        break;
      }
      case 'code': {
        tokens.push({ type: 'code', content: node.text || '' });
        break;
      }
      case 'link': {
        if (node.linkToken) {
          tokens.push(node.linkToken);
        }
        break;
      }
      case 'delimiter': {
        // Unmatched delimiter — emit as literal text
        if (node.count && node.count > 0) {
          const literalText = (node.char || '').repeat(node.count);
          const last = tokens[tokens.length - 1];
          if (last && last.type === 'text') {
            last.content = (last.content || '') + literalText;
          } else {
            tokens.push({ type: 'text', content: literalText });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return tokens;
};

/**
 * Allowed URL schemes for links.
 */
const ALLOWED_SCHEMES = ['https:', 'http:', 'mailto:'];

/**
 * Try to parse a link starting at pos (which points to '[').
 *
 * @param {string} text
 * @param {number} start - Position of '['
 * @returns {{ token: Token, end: number } | null}
 */
const tryParseLink = (text, start) => {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text[i] === '[') {
      depth += 1;
    } else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  if (depth !== 0) return null;

  const closeBracket = i;
  if (closeBracket + 1 >= text.length || text[closeBracket + 1] !== '(') {
    return null;
  }

  let j = closeBracket + 2;
  while (j < text.length && text[j] === ' ') j += 1;

  let href = '';
  let title = '';
  let parenDepth = 0;

  if (j < text.length && text[j] === '<') {
    j += 1;
    const endAngle = text.indexOf('>', j);
    if (endAngle === -1) return null;
    href = text.slice(j, endAngle);
    j = endAngle + 1;
  } else {
    const urlStart = j;
    while (j < text.length) {
      if (text[j] === '(') parenDepth += 1;
      else if (text[j] === ')') {
        if (parenDepth === 0) break;
        parenDepth -= 1;
      } else if (text[j] === ' ') break;
      j += 1;
    }
    href = text.slice(urlStart, j);
  }

  while (j < text.length && text[j] === ' ') j += 1;

  if (j < text.length && (text[j] === '"' || text[j] === "'")) {
    const quote = text[j];
    j += 1;
    const titleStart = j;
    while (j < text.length && text[j] !== quote) {
      if (text[j] === '\\' && j + 1 < text.length) j += 1;
      j += 1;
    }
    if (j >= text.length) return null;
    title = text.slice(titleStart, j);
    j += 1;
  }

  while (j < text.length && text[j] === ' ') j += 1;

  if (j >= text.length || text[j] !== ')') return null;

  if (href && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    try {
      const url = new URL(href);
      if (!ALLOWED_SCHEMES.includes(url.protocol)) {
        return null;
      }
    } catch {
      // Relative URL or malformed — allow
    }
  }

  const linkText = text.slice(start + 1, closeBracket);
  const children = parseInline(linkText);

  /** @type {Token} */
  const token = { type: 'link', children, href };
  if (title) {
    token.title = title;
  }

  return { token, end: j + 1 };
};
