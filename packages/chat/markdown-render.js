// @ts-check

/**
 * @file Chat markdown rendering with chip interpolation.
 *
 * Delegates parsing and rendering to @endo/markmdown, then post-processes
 * the resulting DOM to replace placeholder characters with chip insertion
 * point spans. Code fences are highlighted asynchronously via Monaco.
 */

import {
  parseBlocks,
  parseInline as markmdownParseInline,
  renderBlocks as markmdownRenderBlocks,
  renderInlineTokens,
} from '@endo/markmdown';

/**
 * @callback Colorize
 * @param {string} text - Source text
 * @param {string} language - Language identifier
 * @returns {Promise<string>} HTML string with colorized tokens
 */

/**
 * @typedef {object} ChatRenderOptions
 * @property {Colorize} [colorize] - Async colorizer for code fences
 *   (e.g., Monaco's colorize). When omitted, code fences stay plain text.
 */

/**
 * @typedef {object} RenderResult
 * @property {DocumentFragment} fragment - The rendered DOM fragment
 * @property {HTMLElement[]} insertionPoints - Elements where chips should be inserted
 */

// Placeholder character for chip positions (Unicode private use area)
const PLACEHOLDER = '\uE000';

/**
 * Monaco language aliases.
 * Maps common fence tags to Monaco language identifiers.
 *
 * @param {string} lang
 * @returns {string}
 */
const resolveMonacoLanguage = lang => {
  const lower = lang.toLowerCase();
  /** @type {Record<string, string>} */
  const aliases = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    md: 'markdown',
    json5: 'json',
    jsonc: 'json',
    dockerfile: 'dockerfile',
  };
  return aliases[lower] || lower;
};

/**
 * Asynchronously apply syntax highlighting to all code blocks
 * in a rendered DOM fragment.
 *
 * Finds all `<code>` elements inside `<pre class="md-code-fence">`,
 * colorizes their content, and replaces their innerHTML.
 *
 * @param {DocumentFragment} fragment
 * @param {Colorize} colorizeFn
 * @returns {Promise<void>}
 */
const applyHighlighting = async (fragment, colorizeFn) => {
  const codeBlocks = fragment.querySelectorAll('pre.md-code-fence > code');
  if (codeBlocks.length === 0) return;

  const jobs = Array.from(codeBlocks).map(async $code => {
    const el = /** @type {HTMLElement} */ ($code);
    // Extract language from class="language-xxx"
    const langClass = Array.from(el.classList).find(c =>
      c.startsWith('language-'),
    );
    if (!langClass) return;
    const lang = langClass.slice('language-'.length);
    const monacoLang = resolveMonacoLanguage(lang);
    const source = el.textContent || '';
    try {
      const html = await colorizeFn(source, monacoLang);
      el.innerHTML = html;
    } catch {
      // colorize failed — keep plain text
    }
  });

  await Promise.all(jobs);
};

/**
 * Walk a DOM fragment and replace placeholder characters (\uE000)
 * in text nodes with chip insertion point spans.
 *
 * @param {DocumentFragment} fragment
 * @returns {HTMLElement[]} - Insertion point elements in order
 */
const extractPlaceholders = fragment => {
  /** @type {HTMLElement[]} */
  const insertionPoints = [];
  let placeholderCount = 0;

  /**
   * @param {Node} node
   */
  const walk = node => {
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent || '';
      if (!text.includes(PLACEHOLDER)) return;

      const parts = text.split(PLACEHOLDER);
      const parent = node.parentNode;
      if (!parent) return;

      for (let i = 0; i < parts.length; i += 1) {
        if (i > 0) {
          // Create a span as insertion point for the chip
          const $slot = document.createElement('span');
          $slot.className = 'md-chip-slot';
          $slot.dataset.placeholderIndex = String(placeholderCount);
          placeholderCount += 1;
          insertionPoints.push($slot);
          parent.insertBefore($slot, node);
        }
        if (parts[i]) {
          parent.insertBefore(document.createTextNode(parts[i]), node);
        }
      }
      parent.removeChild(node);
    } else if (node.nodeType === 1) {
      // Element node — walk children (copy to array since we may mutate)
      const children = Array.from(node.childNodes);
      for (const child of children) {
        walk(child);
      }
    }
  };

  const topNodes = Array.from(fragment.childNodes);
  for (const node of topNodes) {
    walk(node);
  }

  return insertionPoints;
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
  return (
    strings
      .slice(0, -1)
      .map(s => s + PLACEHOLDER)
      .join('') + strings[strings.length - 1]
  );
};

/**
 * Render markdown text with chip interpolation.
 *
 * Code fences are rendered as plain text initially.
 * When `options.colorize` is provided, the returned `highlight` method
 * asynchronously applies syntax highlighting to all code blocks.
 *
 * @param {string} text - Markdown text with placeholders
 * @param {ChatRenderOptions} [options]
 * @returns {RenderResult & { highlight: () => Promise<void> }}
 */
export const renderMarkdown = (text, options) => {
  const blocks = parseBlocks(text);
  const fragment = markmdownRenderBlocks(blocks);

  const insertionPoints = extractPlaceholders(fragment);

  // Sort insertion points by their placeholder index
  insertionPoints.sort((a, b) => {
    const aIdx = parseInt(a.dataset.placeholderIndex || '0', 10);
    const bIdx = parseInt(b.dataset.placeholderIndex || '0', 10);
    return aIdx - bIdx;
  });

  const colorizeFn = options && options.colorize;

  return {
    fragment,
    insertionPoints,
    highlight: colorizeFn
      ? () => applyHighlighting(fragment, colorizeFn)
      : () => Promise.resolve(),
  };
};

/**
 * Render plain text (no markdown) with chip interpolation.
 * Falls back to simple text with line breaks when markdown is not wanted.
 *
 * @param {string} text - Text with placeholders
 * @returns {RenderResult}
 */
export const renderPlainText = text => {
  // Parse just for inline formatting and placeholders
  const tokens = markmdownParseInline(text);
  const fragment = renderInlineTokens(tokens, document);

  const insertionPoints = extractPlaceholders(fragment);

  // Sort insertion points by their placeholder index
  insertionPoints.sort((a, b) => {
    const aIdx = parseInt(a.dataset.placeholderIndex || '0', 10);
    const bIdx = parseInt(b.dataset.placeholderIndex || '0', 10);
    return aIdx - bIdx;
  });

  return { fragment, insertionPoints };
};
