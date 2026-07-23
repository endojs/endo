/**
 * Provides {@link collapseHardBreaks} which collapses single hard linebreaks
 * within paragraphs into spaces, for `CHANGELOG` output.
 *
 * @module
 */

import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

/**
 * A single source newline inside markdown prose is a "soft break": every
 * conformant renderer collapses it to a space. Only inside constructs like
 * fenced code blocks are newlines significant.
 */
const collapseSoftBreaks = () => tree => {
  // `text` nodes only ever hold phrasing prose. Code lives in distinct
  // node types (`code`, `inlineCode`) that we never visit, so this is safe
  // for fenced/indented code blocks and inline code spans. Genuine hard
  // breaks (trailing double-space or backslash) are `break` nodes and are
  // likewise left untouched.
  visit(tree, 'text', node => {
    node.value = node.value.replace(/[ \t]*\n[ \t]*/g, ' ');
  });
};

const processor = remark()
  .data('settings', { bullet: '-' })
  .use(remarkGfm)
  .use(collapseSoftBreaks);

/**
 * Collapse single hard linebreaks (markdown soft breaks) within prose into
 * spaces, while preserving markdown structure: paragraph breaks, fenced code
 * blocks, lists, blockquotes, and GFM tables all survive intact.
 *
 * This is achieved by parsing the summary to an mdast tree, rewriting only
 * `text` (phrasing) nodes, and re-serializing. It is the transform applied to
 * changeset summaries before they are handed to the upstream
 * `@changesets/changelog-github` formatter, so that hard-wrapped prose in the
 * `.md` source renders as flowing text rather than awkward multi-line indented
 * blocks in the generated CHANGELOG.
 *
 * @param {string} summary
 * @returns {string}
 */
export const collapseHardBreaks = summary =>
  // Normalize CRLF/CR to LF up front so carriage returns never survive inside
  // phrasing text nodes (the soft-break rewrite below only targets `\n`).
  processor.processSync(summary.replace(/\r\n?/g, '\n')).toString().trim();
