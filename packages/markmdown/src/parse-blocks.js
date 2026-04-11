// @ts-check

/** @import { Block, Token } from './types.js' */

import { parseInline } from './parse-inline.js';

/**
 * Regex for GFM table separator row.
 * Matches lines like |---|---| or |:--:|---:| etc.
 */
const TABLE_SEP_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Parse a table separator cell to determine alignment.
 *
 * @param {string} cell - Trimmed separator cell content like '---', ':--', '--:', ':--:'
 * @returns {'left' | 'right' | 'center' | 'none'}
 */
const parseAlignment = cell => {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
};

/**
 * Split a table row into cells.
 * Handles leading/trailing pipes.
 *
 * @param {string} line
 * @returns {string[]}
 */
const splitTableRow = line => {
  let trimmed = line.trim();
  // Remove leading pipe
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  // Remove trailing pipe
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
};

/**
 * Check if a line is a horizontal rule.
 *
 * @param {string} line
 * @returns {boolean}
 */
const isHorizontalRule = line => {
  const trimmed = line.trim();
  return /^(\*[\s*]*\*[\s*]*\*[\s*]*|---[\s-]*|-[\s-]*-[\s-]*-[\s-]*|___[\s_]*|_[\s_]*_[\s_]*_[\s_]*)$/.test(
    trimmed,
  );
};

/**
 * Parse text into block-level structures.
 *
 * @param {string} text - Markdown text
 * @returns {Block[]}
 */
export const parseBlocks = text => {
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

    // Code fence (backtick or tilde, 3+ characters)
    if (!handled) {
      const fenceMatch = line.match(/^(`{3,}|~{3,})(\w*)$/);
      if (fenceMatch) {
        const fenceChar = fenceMatch[1][0];
        const fenceLen = fenceMatch[1].length;
        const language = fenceMatch[2] || '';
        const codeLines = [];
        i += 1;
        while (i < lines.length) {
          const closingMatch = lines[i].match(
            fenceChar === '`' ? /^`{3,}\s*$/ : /^~{3,}\s*$/,
          );
          if (closingMatch) {
            const closeLen = closingMatch[0].trim().length;
            if (closeLen >= fenceLen) {
              i += 1;
              break;
            }
          }
          codeLines.push(lines[i]);
          i += 1;
        }
        blocks.push({
          type: 'code-fence',
          language,
          content: codeLines.join('\n'),
        });
        handled = true;
      }
    }

    // Horizontal rule (must check before heading and list)
    if (!handled && isHorizontalRule(line)) {
      blocks.push({ type: 'horizontal-rule' });
      i += 1;
      handled = true;
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

    // Table: detect header row followed by separator row
    if (!handled && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (line.includes('|') && nextLine && TABLE_SEP_RE.test(nextLine)) {
        const headerCells = splitTableRow(line);
        const sepCells = splitTableRow(nextLine);
        const alignments = sepCells.map(parseAlignment);
        const colCount = headerCells.length;

        const headerRow = headerCells.map(c => parseInline(c));

        i += 2; // Skip header and separator

        /** @type {Token[][][]} */
        const bodyRows = [];
        while (i < lines.length && lines[i].includes('|')) {
          const rowCells = splitTableRow(lines[i]);
          /** @type {Token[][]} */
          const row = [];
          for (let c = 0; c < colCount; c += 1) {
            if (c < rowCells.length) {
              row.push(parseInline(rowCells[c]));
            } else {
              row.push([]);
            }
          }
          bodyRows.push(row);
          i += 1;
        }

        blocks.push({
          type: 'table',
          headerRow,
          alignments,
          bodyRows,
        });
        handled = true;
      }
    }

    // Blockquote
    if (!handled) {
      const bqMatch = line.match(/^>\s?(.*)$/);
      if (bqMatch) {
        const bqLines = [];
        while (i < lines.length) {
          const m = lines[i].match(/^>\s?(.*)$/);
          if (m) {
            bqLines.push(m[1]);
          } else if (lines[i].trim() === '') {
            // Check if next line continues blockquote
            if (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) {
              bqLines.push('');
            } else {
              break;
            }
          } else {
            break;
          }
          i += 1;
        }
        const innerBlocks = parseBlocks(bqLines.join('\n'));
        blocks.push({
          type: 'blockquote',
          children: innerBlocks,
        });
        handled = true;
      }
    }

    // Unordered list item
    if (!handled) {
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (ulMatch) {
        const items = parseListItems(lines, i, false);
        blocks.push({
          type: 'list',
          ordered: false,
          children: items.items,
        });
        i = items.end;
        handled = true;
      }
    }

    // Ordered list item
    if (!handled) {
      const olMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
      if (olMatch) {
        const items = parseListItems(lines, i, true);
        blocks.push({
          type: 'list',
          ordered: true,
          children: items.items,
        });
        i = items.end;
        handled = true;
      }
    }

    // Paragraph - collect lines until empty line or block-level element
    if (!handled) {
      const paraLines = [];
      while (i < lines.length) {
        const l = lines[i];
        if (
          l.trim() === '' ||
          /^#{1,6}\s/.test(l) ||
          /^(\s*)[-*+]\s/.test(l) ||
          /^\s*\d+[.)]\s/.test(l) ||
          /^(`{3,}|~{3,})/.test(l) ||
          /^>\s?/.test(l) ||
          isHorizontalRule(l) ||
          (i + 1 < lines.length &&
            l.includes('|') &&
            TABLE_SEP_RE.test(lines[i + 1]))
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
 * Parse a sequence of list items with nesting support.
 * Items at the same indentation are siblings. Items with greater
 * indentation than the first item become sub-lists of the preceding item.
 *
 * @param {string[]} lines
 * @param {number} start
 * @param {boolean} ordered
 * @returns {{ items: Block[], end: number }}
 */
const parseListItems = (lines, start, ordered) => {
  // Generic list marker regex (matches both ordered and unordered)
  const anyMarkerRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const baseIndent = (lines[start].match(/^(\s*)/) || ['', ''])[1].length;

  /** @type {Block[]} */
  const items = [];
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(anyMarkerRe);
    if (!m) break;

    const indent = m[1].length;
    const marker = m[2];
    const content = m[3];
    const isOrdered = /\d/.test(marker);

    // If indented further than base, this is a sub-list — collect and recurse
    if (indent > baseIndent) {
      // Attach sub-list to the last item
      if (items.length === 0) break;
      const lastItem = items[items.length - 1];
      const subResult = parseListItems(lines, i, isOrdered);
      if (!lastItem.children) lastItem.children = [];
      lastItem.children.push({
        type: 'list',
        ordered: isOrdered,
        children: subResult.items,
      });
      i = subResult.end;
      continue;
    }

    // If indented less than base, we've left this list level
    if (indent < baseIndent) break;

    // Same indent — check if marker type matches
    if (isOrdered !== ordered) break;

    /** @type {Block} */
    const item = {
      type: 'list-item',
      content: parseInline(content),
    };
    items.push(item);
    i += 1;
  }

  return { items, end: i };
};
