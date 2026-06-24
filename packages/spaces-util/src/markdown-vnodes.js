// @ts-check

/**
 * @file Markdown -> Preact vnode rendering for the confined chat UI.
 *
 * The imperative {@link module:./markdown-render.js} renderer produces a DOM
 * `DocumentFragment` (and would let a caller splice token chips in by mutating
 * the DOM). Under the confined Preact renderer we cannot hand the sanitizing
 * surface raw DOM (and `dangerouslySetInnerHTML` is stripped on purpose), so
 * this module reuses markmdown's PARSER (`parseBlocks`) but EMITS VNODES with
 * the SAME `.md-*` / `.inline-code` / `.md-link` class names the DOM renderer
 * emits, so the existing CSS applies unchanged.
 *
 * Token chips: `prepareTextWithPlaceholders` interleaves a private-use
 * placeholder character between message string segments. We split text-token
 * content on that character and, at each split point, invoke the caller's
 * `renderToken(index)` callback to substitute an interactive chip vnode. The
 * placeholder index increments left-to-right, matching the imperative
 * `insertionPoints` ordering.
 */

/** @import { VNode } from 'preact' */

// markmdown does not export its `./src/types.js` subpath, so the `Block` /
// `Token` shapes it produces are mirrored locally for the JSDoc annotations
// below. Keep in sync with `@endo/markmdown/src/types.js`.
/**
 * @typedef {object} Token
 * @property {'text' | 'emphasis' | 'strong' | 'strikethrough' | 'code' | 'link'} type
 * @property {string} [content]
 * @property {Token[]} [children]
 * @property {string} [href]
 * @property {string} [title]
 */
/**
 * @typedef {object} Block
 * @property {'paragraph' | 'heading' | 'code-fence' | 'list-item' | 'list' | 'table' | 'blockquote' | 'horizontal-rule'} type
 * @property {number} [level]
 * @property {string} [language]
 * @property {Token[] | string} [content]
 * @property {Block[]} [children]
 * @property {boolean} [ordered]
 * @property {Token[][]} [headerRow]
 * @property {Token[][][]} [bodyRows]
 * @property {Array<'left' | 'right' | 'center' | 'none'>} [alignments]
 */

import harden from '@endo/harden';
import { parseBlocks } from '@endo/markmdown';

import { Fragment, h } from 'preact';

// The chip-placeholder character (Unicode private use area). Must match the
// constant used by `prepareTextWithPlaceholders` in markdown-render.js. It is
// module-private there, so it is duplicated here rather than imported; a drift
// would surface immediately as un-substituted placeholder text in chip tests.
const PLACEHOLDER = '';

/**
 * @typedef {(index: number) => VNode | null} RenderToken
 *   Called once per placeholder, left-to-right, to produce the chip vnode that
 *   replaces it. `index` is the zero-based placeholder ordinal.
 */

/**
 * Render a single text token's content into vnodes, splitting on the
 * placeholder character and substituting `renderToken(index)` at each split.
 * Newlines become `<br>` (matching the DOM renderer).
 *
 * @param {string} content
 * @param {RenderToken | undefined} renderToken
 * @param {{ next: number }} counter - Mutable placeholder counter, shared
 *   across the whole render so indices are globally monotonic.
 * @returns {Array<VNode | string | null>}
 */
const renderTextContent = (content, renderToken, counter) => {
  /** @type {Array<VNode | string | null>} */
  const out = [];
  const segments = content.split(PLACEHOLDER);
  for (let i = 0; i < segments.length; i += 1) {
    if (i > 0) {
      const index = counter.next;
      counter.next += 1;
      out.push(renderToken ? renderToken(index) : null);
    }
    const segment = segments[i];
    if (!segment) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const lines = segment.split('\n');
    for (let j = 0; j < lines.length; j += 1) {
      if (j > 0) {
        out.push(h('br', null));
      }
      if (lines[j]) {
        out.push(lines[j]);
      }
    }
  }
  return out;
};

/**
 * Render code-fence content into vnodes, splitting on the placeholder
 * character and substituting `renderToken(index)` at each split. Unlike
 * `renderTextContent`, newlines stay literal (the surrounding `<pre>`
 * preserves whitespace), matching the imperative renderer, which walks the
 * fence's text node and only splits on placeholders. Sharing the counter keeps
 * placeholder indices aligned with chips outside the fence.
 *
 * @param {string} content
 * @param {RenderToken | undefined} renderToken
 * @param {{ next: number }} counter
 * @returns {Array<VNode | string | null>}
 */
const renderCodeContent = (content, renderToken, counter) => {
  /** @type {Array<VNode | string | null>} */
  const out = [];
  const segments = content.split(PLACEHOLDER);
  for (let i = 0; i < segments.length; i += 1) {
    if (i > 0) {
      const index = counter.next;
      counter.next += 1;
      out.push(renderToken ? renderToken(index) : null);
    }
    if (segments[i]) {
      out.push(segments[i]);
    }
  }
  return out;
};

/**
 * Render inline tokens to an array of vnodes, mirroring markmdown's
 * `renderInlineTokens` element/class choices.
 *
 * @param {Token[]} tokens
 * @param {RenderToken | undefined} renderToken
 * @param {{ next: number }} counter
 * @returns {Array<VNode | string | null>}
 */
const renderInline = (tokens, renderToken, counter) => {
  /** @type {Array<VNode | string | null>} */
  const out = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        out.push(
          ...renderTextContent(token.content || '', renderToken, counter),
        );
        break;
      }
      case 'emphasis': {
        out.push(
          h(
            'em',
            null,
            ...renderInline(token.children || [], renderToken, counter),
          ),
        );
        break;
      }
      case 'strong': {
        out.push(
          h(
            'strong',
            null,
            ...renderInline(token.children || [], renderToken, counter),
          ),
        );
        break;
      }
      case 'strikethrough': {
        out.push(
          h(
            's',
            null,
            ...renderInline(token.children || [], renderToken, counter),
          ),
        );
        break;
      }
      case 'code': {
        out.push(h('code', { class: 'inline-code' }, token.content || ''));
        break;
      }
      case 'link': {
        // The confined renderer scheme-checks the href; a disallowed scheme
        // collapses the <a> to a Fragment. No further sanitization needed here.
        out.push(
          h(
            'a',
            {
              class: 'md-link',
              href: token.href || '',
              target: '_blank',
              rel: 'noopener noreferrer',
              ...(token.title ? { title: token.title } : {}),
            },
            ...renderInline(token.children || [], renderToken, counter),
          ),
        );
        break;
      }
      default:
        break;
    }
  }
  return out;
};

/**
 * Render a list of blocks to vnodes, mirroring markmdown's `renderBlocks`.
 *
 * @param {Block[]} blocks
 * @param {RenderToken | undefined} renderToken
 * @param {{ next: number }} counter
 * @returns {Array<VNode | null>}
 */
const renderBlockList = (blocks, renderToken, counter) => {
  /** @type {Array<VNode | null>} */
  const out = [];
  for (let b = 0; b < blocks.length; b += 1) {
    const block = blocks[b];
    const key = String(b);
    switch (block.type) {
      case 'paragraph': {
        out.push(
          h(
            'p',
            { class: 'md-paragraph', key },
            ...renderInline(
              Array.isArray(block.content) ? block.content : [],
              renderToken,
              counter,
            ),
          ),
        );
        break;
      }
      case 'heading': {
        const level = Math.min(6, Math.max(1, block.level || 1));
        out.push(
          h(
            `h${level}`,
            { class: `md-heading md-h${level}`, key },
            ...renderInline(
              Array.isArray(block.content) ? block.content : [],
              renderToken,
              counter,
            ),
          ),
        );
        break;
      }
      case 'code-fence': {
        const content = typeof block.content === 'string' ? block.content : '';
        // TODO(inbox stage 3): Monaco `colorize` the fence source instead of
        // emitting it as plain text. Until then the raw source is the code
        // element's text content (no dangerouslySetInnerHTML). Chip
        // placeholders inside the fence are substituted (and the shared counter
        // advanced) so chips after the fence keep the correct index, matching
        // the imperative renderer.
        out.push(
          h(
            'pre',
            { class: 'md-code-fence', key },
            block.language
              ? h('span', { class: 'md-code-fence-language' }, block.language)
              : null,
            h(
              'code',
              block.language ? { class: `language-${block.language}` } : null,
              ...renderCodeContent(content, renderToken, counter),
            ),
          ),
        );
        break;
      }
      case 'list': {
        const children = block.children || [];
        out.push(
          h(
            block.ordered ? 'ol' : 'ul',
            { class: 'md-list', key },
            ...children.map((item, i) =>
              h(
                'li',
                { class: 'md-list-item', key: String(i) },
                ...renderInline(
                  Array.isArray(item.content) ? item.content : [],
                  renderToken,
                  counter,
                ),
                ...(item.children && item.children.length > 0
                  ? renderBlockList(item.children, renderToken, counter)
                  : []),
              ),
            ),
          ),
        );
        break;
      }
      case 'table': {
        out.push(
          h(
            'table',
            { class: 'md-table', key },
            block.headerRow
              ? h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    ...block.headerRow.map((cell, c) => {
                      const align =
                        block.alignments && block.alignments[c] !== 'none'
                          ? block.alignments[c]
                          : null;
                      return h(
                        'th',
                        {
                          key: String(c),
                          ...(align ? { style: `text-align: ${align}` } : {}),
                        },
                        ...renderInline(cell, renderToken, counter),
                      );
                    }),
                  ),
                )
              : null,
            block.bodyRows && block.bodyRows.length > 0
              ? h(
                  'tbody',
                  null,
                  ...block.bodyRows.map((row, r) =>
                    h(
                      'tr',
                      { key: String(r) },
                      ...row.map((cell, c) => {
                        const align =
                          block.alignments && block.alignments[c] !== 'none'
                            ? block.alignments[c]
                            : null;
                        return h(
                          'td',
                          {
                            key: String(c),
                            ...(align ? { style: `text-align: ${align}` } : {}),
                          },
                          ...renderInline(cell, renderToken, counter),
                        );
                      }),
                    ),
                  ),
                )
              : null,
          ),
        );
        break;
      }
      case 'blockquote': {
        out.push(
          h(
            'blockquote',
            { class: 'md-blockquote', key },
            ...renderBlockList(block.children || [], renderToken, counter),
          ),
        );
        break;
      }
      case 'horizontal-rule': {
        out.push(h('hr', { class: 'md-rule', key }));
        break;
      }
      default:
        break;
    }
  }
  return out;
};

/**
 * Parse a markdown string (which may contain chip placeholders) into an array
 * of Preact vnodes, substituting `renderToken(index)` at each placeholder.
 *
 * The first block (a `<p class="md-paragraph">` or heading) is returned as the
 * `firstBlockKind`, so the caller can decide whether to inject a sender chip
 * into it or prepend a fresh paragraph (matching the imperative renderer).
 *
 * @param {string} text - Markdown text, possibly with placeholder characters.
 * @param {object} [options]
 * @param {RenderToken} [options.renderToken] - Chip substitution callback.
 * @returns {{
 *   nodes: Array<VNode | null>,
 *   placeholderCount: number,
 *   firstBlockKind: 'paragraph' | 'heading' | 'other' | 'none',
 * }}
 */
export const markdownToVnodes = (text, options = {}) => {
  const { renderToken } = options;
  const blocks = parseBlocks(text);
  const counter = { next: 0 };
  const nodes = renderBlockList(blocks, renderToken, counter);

  /** @type {'paragraph' | 'heading' | 'other' | 'none'} */
  let firstBlockKind = 'none';
  if (blocks.length > 0) {
    const first = blocks[0];
    if (first.type === 'paragraph') {
      firstBlockKind = 'paragraph';
    } else if (first.type === 'heading') {
      firstBlockKind = 'heading';
    } else {
      firstBlockKind = 'other';
    }
  }

  // NB: the returned object is intentionally NOT hardened. It carries live
  // Preact vnodes, which the reconciler mutates (`vnode.__*` internal pointers)
  // during rendering; deep-freezing them breaks reconciliation.
  return { nodes, placeholderCount: counter.next, firstBlockKind };
};
harden(markdownToVnodes);

/**
 * Render a markdown string into a single Preact `Fragment` vnode (no chip
 * substitution). Convenience wrapper for callers that just want the tree.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {RenderToken} [options.renderToken]
 * @returns {VNode}
 */
export const MarkdownFragment = (text, options) => {
  const { nodes } = markdownToVnodes(text, options);
  return h(Fragment, null, ...nodes);
};
harden(MarkdownFragment);
