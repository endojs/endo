// @ts-check
import { h } from 'preact';

/** @import { ComponentChildren } from 'preact' */

/**
 * Render a single line of inline-markdown into an array of safe vnodes /
 * strings. Supports the same minimal markup the old DOM-string renderer did:
 * `**bold**`, `*italic*`, and `` `code` ``. Because the output is a vnode tree
 * (not an HTML string fed to a raw-HTML sink), the confined renderer
 * sanitizes it like any other tree — there is no raw-HTML injection sink.
 *
 * @param {string} line
 * @returns {Array<ComponentChildren>}
 */
const renderInlineMarkdown = line => {
  // A single tokenizer pass: match the next bold/italic/code span, emit the
  // plain text before it as a string and the span as an element vnode.
  /** @type {Array<ComponentChildren>} */
  const out = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match = pattern.exec(line);
  while (match !== null) {
    if (match.index > lastIndex) {
      out.push(line.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      out.push(h('strong', null, match[1]));
    } else if (match[2] !== undefined) {
      out.push(h('em', null, match[2]));
    } else if (match[3] !== undefined) {
      out.push(h('code', null, match[3]));
    }
    lastIndex = pattern.lastIndex;
    match = pattern.exec(line);
  }
  if (lastIndex < line.length) {
    out.push(line.slice(lastIndex));
  }
  return out;
};

/**
 * Render the text of a single paragraph, preserving single newlines as `<br>`
 * elements (mirroring the old `\n` -> `<br/>` replacement).
 *
 * @param {string} paragraph
 * @returns {Array<ComponentChildren>}
 */
const renderParagraphBody = paragraph => {
  const lines = paragraph.split('\n');
  /** @type {Array<ComponentChildren>} */
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      out.push(h('br', null));
    }
    out.push(...renderInlineMarkdown(lines[i]));
  }
  return out;
};

/**
 * Renders the narrative text from the fae agent's response.
 * Simple markdown-like rendering (paragraphs, bold, italic, code).
 *
 * @param {object} props
 * @param {string} props.narrative
 * @param {boolean} props.loading
 */
export function NarrativePanel({ narrative, loading }) {
  if (loading) {
    return h(
      'div',
      { class: 'whylip-narrative' },
      h('div', { class: 'narrative-loading' }, 'Thinking...'),
    );
  }

  if (!narrative) {
    return h(
      'div',
      { class: 'whylip-narrative' },
      h(
        'div',
        { class: 'narrative-empty' },
        'Ask a question to start learning.',
      ),
    );
  }

  // Minimal markdown: split into paragraphs, render bold/italic/code as
  // sanitized vnodes (NOT a raw-HTML sink, which the confined renderer
  // strips).
  const paragraphs = narrative.split(/\n{2,}/);

  return h(
    'div',
    { class: 'whylip-narrative' },
    h(
      'div',
      { class: 'narrative-content' },
      ...paragraphs.map((p, i) =>
        h(
          'p',
          { class: 'narrative-paragraph', key: String(i) },
          ...renderParagraphBody(p),
        ),
      ),
    ),
  );
}
harden(NarrativePanel);
