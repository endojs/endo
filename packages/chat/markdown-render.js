// @ts-check
/* global document */

/**
 * @file Markdown subset parser with chip interpolation support.
 *
 * Supports: headings (#-######), bold (*), italic (/), strikethrough (~),
 * underline (_), unordered lists (-), ordered lists (1.), inline code (`),
 * code fences (```).
 *
 * Designed to accept text with placeholders and return DOM with insertion
 * points for token chips at tracked positions.
 */

/**
 * @typedef {object} RenderResult
 * @property {DocumentFragment} fragment - The rendered DOM fragment
 * @property {HTMLElement[]} insertionPoints - Elements where chips should be inserted
 */

/**
 * @typedef {object} Token
 * @property {'text' | 'bold' | 'italic' | 'strikethrough' | 'underline' | 'code' | 'placeholder'} type
 * @property {string} content
 * @property {number} [placeholderIndex] - Index for placeholder tokens
 */

/**
 * @typedef {object} Block
 * @property {'paragraph' | 'heading' | 'code-fence' | 'list-item' | 'list'} type
 * @property {number} [level] - Heading level (1-6) or list nesting
 * @property {string} [language] - Code fence language
 * @property {Token[] | string} content - Inline tokens for text blocks, raw string for code
 * @property {Block[]} [children] - Child blocks for lists
 * @property {boolean} [ordered] - Whether list is ordered
 */

// Placeholder character for chip positions (Unicode private use area)
const PLACEHOLDER = '\uE000';

/**
 * Parse inline formatting (bold, italic, strikethrough, inline code).
 * Handles placeholder markers to track chip insertion positions.
 *
 * @param {string} text - Text to parse
 * @returns {Token[]}
 */
const parseInline = text => {
  /** @type {Token[]} */
  const tokens = [];
  let pos = 0;
  let placeholderCount = 0;

  /**
   * Add text token if non-empty.
   * @param {string} content
   */
  const addText = content => {
    if (content) {
      tokens.push({ type: 'text', content });
    }
  };

  while (pos < text.length) {
    const remaining = text.slice(pos);
    let matched = false;

    // Check for placeholder
    if (remaining[0] === PLACEHOLDER) {
      tokens.push({ type: 'placeholder', content: '', placeholderIndex: placeholderCount });
      placeholderCount += 1;
      pos += 1;
      matched = true;
    }

    // Check for inline code (backtick)
    if (!matched) {
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push({ type: 'code', content: codeMatch[1] });
        pos += codeMatch[0].length;
        matched = true;
      }
    }

    // Check for bold (*text*)
    if (!matched) {
      const boldMatch = remaining.match(/^\*([^*]+)\*/);
      if (boldMatch) {
        tokens.push({ type: 'bold', content: boldMatch[1] });
        pos += boldMatch[0].length;
        matched = true;
      }
    }

    // Check for italic (/text/)
    if (!matched) {
      const italicMatch = remaining.match(/^\/([^/]+)\//);
      if (italicMatch) {
        tokens.push({ type: 'italic', content: italicMatch[1] });
        pos += italicMatch[0].length;
        matched = true;
      }
    }

    // Check for strikethrough (~text~)
    if (!matched) {
      const strikeMatch = remaining.match(/^~([^~]+)~/);
      if (strikeMatch) {
        tokens.push({ type: 'strikethrough', content: strikeMatch[1] });
        pos += strikeMatch[0].length;
        matched = true;
      }
    }

    // Check for underline (_text_)
    if (!matched) {
      const underlineMatch = remaining.match(/^_([^_]+)_/);
      if (underlineMatch) {
        tokens.push({ type: 'underline', content: underlineMatch[1] });
        pos += underlineMatch[0].length;
        matched = true;
      }
    }

    // Find next special character or placeholder
    if (!matched) {
      let nextSpecial = remaining.length;
      const specialChars = ['`', '*', '/', '~', '_', PLACEHOLDER];
      for (const char of specialChars) {
        const idx = remaining.indexOf(char);
        if (idx > 0 && idx < nextSpecial) {
          nextSpecial = idx;
        }
      }

      // Add plain text up to next special or end
      if (nextSpecial > 0) {
        addText(remaining.slice(0, nextSpecial));
        pos += nextSpecial;
      } else {
        // Single special char that didn't match a pattern
        addText(remaining[0]);
        pos += 1;
      }
    }
  }

  return tokens;
};

/**
 * Parse text into block-level structures.
 *
 * @param {string} text - Markdown text
 * @returns {Block[]}
 */
const parseBlocks = text => {
  /** @type {Block[]} */
  const blocks = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let handled = false;

    // Empty line - skip
    if (line.trim() === '') {
      i += 1;
      handled = true;
    }

    // Code fence
    if (!handled) {
      const fenceMatch = line.match(/^```(\w*)$/);
      if (fenceMatch) {
        const language = fenceMatch[1] || '';
        const codeLines = [];
        i += 1;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1; // Skip closing fence
        blocks.push({
          type: 'code-fence',
          language,
          content: codeLines.join('\n'),
        });
        handled = true;
      }
    }

    // Heading
    if (!handled) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          content: parseInline(headingMatch[2]),
        });
        i += 1;
        handled = true;
      }
    }

    // Unordered list item
    if (!handled) {
      const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (ulMatch) {
        // Collect consecutive list items
        /** @type {Block[]} */
        const items = [];
        while (i < lines.length) {
          const itemMatch = lines[i].match(/^(\s*)[-*]\s+(.+)$/);
          if (!itemMatch) break;
          items.push({
            type: 'list-item',
            content: parseInline(itemMatch[2]),
          });
          i += 1;
        }
        blocks.push({
          type: 'list',
          ordered: false,
          children: items,
        });
        handled = true;
      }
    }

    // Ordered list item
    if (!handled) {
      const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
      if (olMatch) {
        // Collect consecutive list items
        /** @type {Block[]} */
        const items = [];
        while (i < lines.length) {
          const itemMatch = lines[i].match(/^(\s*)\d+[.)]\s+(.+)$/);
          if (!itemMatch) break;
          items.push({
            type: 'list-item',
            content: parseInline(itemMatch[2]),
          });
          i += 1;
        }
        blocks.push({
          type: 'list',
          ordered: true,
          children: items,
        });
        handled = true;
      }
    }

    // Paragraph - collect lines until empty line or block-level element
    if (!handled) {
      const paraLines = [];
      while (i < lines.length) {
        const l = lines[i];
        // Stop at empty line, heading, list, or code fence
        if (
          l.trim() === '' ||
          /^#{1,6}\s/.test(l) ||
          /^[-*]\s/.test(l) ||
          /^\d+[.)]\s/.test(l) ||
          /^```/.test(l)
        ) {
          break;
        }
        paraLines.push(l);
        i += 1;
      }
      if (paraLines.length > 0) {
        blocks.push({
          type: 'paragraph',
          content: parseInline(paraLines.join('\n')),
        });
      }
    }
  }

  return blocks;
};

/**
 * Render inline tokens to DOM elements.
 *
 * @param {Token[]} tokens
 * @param {HTMLElement[]} insertionPoints - Array to collect insertion point elements
 * @returns {DocumentFragment}
 */
const renderInlineTokens = (tokens, insertionPoints) => {
  const fragment = document.createDocumentFragment();

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        // Handle newlines within text
        const lines = token.content.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (i > 0) {
            fragment.appendChild(document.createElement('br'));
          }
          if (lines[i]) {
            fragment.appendChild(document.createTextNode(lines[i]));
          }
        }
        break;
      }
      case 'bold': {
        const $el = document.createElement('strong');
        $el.textContent = token.content;
        fragment.appendChild($el);
        break;
      }
      case 'italic': {
        const $el = document.createElement('em');
        $el.textContent = token.content;
        fragment.appendChild($el);
        break;
      }
      case 'strikethrough': {
        const $el = document.createElement('s');
        $el.textContent = token.content;
        fragment.appendChild($el);
        break;
      }
      case 'underline': {
        const $el = document.createElement('u');
        $el.textContent = token.content;
        fragment.appendChild($el);
        break;
      }
      case 'code': {
        const $el = document.createElement('code');
        $el.className = 'inline-code';
        $el.textContent = token.content;
        fragment.appendChild($el);
        break;
      }
      case 'placeholder': {
        // Create a span as insertion point for the chip
        const $el = document.createElement('span');
        $el.className = 'md-chip-slot';
        $el.dataset.placeholderIndex = String(token.placeholderIndex);
        insertionPoints.push($el);
        fragment.appendChild($el);
        break;
      }
      default:
        break;
    }
  }

  return fragment;
};

/**
 * Simple syntax highlighting for code.
 * Uses basic regex patterns for common languages.
 *
 * @param {string} code
 * @param {string} language
 * @returns {DocumentFragment}
 */
const highlightCode = (code, language) => {
  const fragment = document.createDocumentFragment();

  // Language-specific keyword sets
  const jsKeywords =
    /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|yield|typeof|instanceof|in|of|void|delete|this|super|null|undefined|true|false|NaN|Infinity)\b/g;
  const jsStrings = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  const jsComments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const jsNumbers = /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[0-9a-f]+|0b[01]+|0o[0-7]+)\b/gi;

  if (!language || !['js', 'javascript', 'ts', 'typescript'].includes(language.toLowerCase())) {
    // No highlighting - just preserve whitespace
    const $code = document.createElement('span');
    $code.textContent = code;
    fragment.appendChild($code);
    return fragment;
  }

  // Tokenize by finding all matches and sorting by position
  /** @type {Array<{start: number, end: number, type: string, text: string}>} */
  const highlights = [];

  // Find all matches
  const patterns = [
    { regex: jsComments, type: 'comment' },
    { regex: jsStrings, type: 'string' },
    { regex: jsKeywords, type: 'keyword' },
    { regex: jsNumbers, type: 'number' },
  ];

  for (const { regex, type } of patterns) {
    regex.lastIndex = 0;
    let match = regex.exec(code);
    while (match !== null) {
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        text: match[0],
      });
      match = regex.exec(code);
    }
  }

  // Sort by start position
  highlights.sort((a, b) => a.start - b.start);

  // Remove overlapping highlights (keep first/earlier match)
  /** @type {typeof highlights} */
  const filtered = [];
  let lastEnd = 0;
  for (const h of highlights) {
    if (h.start >= lastEnd) {
      filtered.push(h);
      lastEnd = h.end;
    }
  }

  // Render with highlighting
  let pos = 0;
  for (const h of filtered) {
    // Add plain text before highlight
    if (h.start > pos) {
      fragment.appendChild(document.createTextNode(code.slice(pos, h.start)));
    }
    // Add highlighted span
    const $span = document.createElement('span');
    $span.className = `code-${h.type}`;
    $span.textContent = h.text;
    fragment.appendChild($span);
    pos = h.end;
  }

  // Add remaining plain text
  if (pos < code.length) {
    fragment.appendChild(document.createTextNode(code.slice(pos)));
  }

  return fragment;
};

/**
 * Render blocks to DOM.
 *
 * @param {Block[]} blocks
 * @param {HTMLElement[]} insertionPoints
 * @returns {DocumentFragment}
 */
const renderBlocks = (blocks, insertionPoints) => {
  const fragment = document.createDocumentFragment();

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph': {
        const $p = document.createElement('p');
        $p.className = 'md-paragraph';
        if (Array.isArray(block.content)) {
          $p.appendChild(renderInlineTokens(block.content, insertionPoints));
        }
        fragment.appendChild($p);
        break;
      }
      case 'heading': {
        const level = Math.min(6, Math.max(1, block.level || 1));
        const $h = document.createElement(`h${level}`);
        $h.className = `md-heading md-h${level}`;
        if (Array.isArray(block.content)) {
          $h.appendChild(renderInlineTokens(block.content, insertionPoints));
        }
        fragment.appendChild($h);
        break;
      }
      case 'code-fence': {
        // Wrap code fence in a paragraph for consistent structure
        const $p = document.createElement('p');
        $p.className = 'md-paragraph md-code-fence-wrapper';
        const $pre = document.createElement('pre');
        $pre.className = 'md-code-fence';
        if (block.language) {
          const $label = document.createElement('span');
          $label.className = 'md-code-fence-language';
          $label.textContent = block.language;
          $pre.appendChild($label);
        }
        const $code = document.createElement('code');
        if (block.language) {
          $code.className = `language-${block.language}`;
          $code.dataset.language = block.language;
        }
        const content = typeof block.content === 'string' ? block.content : '';
        $code.appendChild(highlightCode(content, block.language || ''));
        $pre.appendChild($code);
        $p.appendChild($pre);
        fragment.appendChild($p);
        break;
      }
      case 'list': {
        const $list = document.createElement(block.ordered ? 'ol' : 'ul');
        $list.className = 'md-list';
        if (block.children) {
          for (const item of block.children) {
            const $li = document.createElement('li');
            $li.className = 'md-list-item';
            if (Array.isArray(item.content)) {
              $li.appendChild(renderInlineTokens(item.content, insertionPoints));
            }
            $list.appendChild($li);
          }
        }
        fragment.appendChild($list);
        break;
      }
      default:
        break;
    }
  }

  return fragment;
};

/**
 * Prepare text with chip placeholders for markdown rendering.
 *
 * Takes an array of text segments and inserts placeholders between them.
 *
 * @param {string[]} strings - Text segments (from parseMessage)
 * @returns {string} - Text with placeholders
 */
export const prepareTextWithPlaceholders = strings => {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  // Join strings with placeholder characters
  // strings[0] + PLACEHOLDER + strings[1] + PLACEHOLDER + ... + strings[n]
  return strings.slice(0, -1).map(s => s + PLACEHOLDER).join('') + strings[strings.length - 1];
};

/**
 * Render markdown text with chip interpolation.
 *
 * @param {string} text - Markdown text with placeholders
 * @returns {RenderResult}
 */
export const renderMarkdown = text => {
  /** @type {HTMLElement[]} */
  const insertionPoints = [];

  const blocks = parseBlocks(text);
  const fragment = renderBlocks(blocks, insertionPoints);

  // Sort insertion points by their placeholder index
  insertionPoints.sort((a, b) => {
    const aIdx = parseInt(a.dataset.placeholderIndex || '0', 10);
    const bIdx = parseInt(b.dataset.placeholderIndex || '0', 10);
    return aIdx - bIdx;
  });

  return { fragment, insertionPoints };
};

/**
 * Render plain text (no markdown) with chip interpolation.
 * Falls back to simple text with line breaks when markdown is not wanted.
 *
 * @param {string} text - Text with placeholders
 * @returns {RenderResult}
 */
export const renderPlainText = text => {
  /** @type {HTMLElement[]} */
  const insertionPoints = [];
  const fragment = document.createDocumentFragment();

  // Parse just for placeholders
  const tokens = parseInline(text);
  fragment.appendChild(renderInlineTokens(tokens, insertionPoints));

  // Sort insertion points by their placeholder index
  insertionPoints.sort((a, b) => {
    const aIdx = parseInt(a.dataset.placeholderIndex || '0', 10);
    const bIdx = parseInt(b.dataset.placeholderIndex || '0', 10);
    return aIdx - bIdx;
  });

  return { fragment, insertionPoints };
};
