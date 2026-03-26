// @ts-check

/**
 * A minimal CommonMark-aware scanner for extracting help documentation
 * from structured Markdown files ("helpdown" format).
 *
 * Level-1 headers (`# EntityName - description`) define entities.
 * Level-2 headers (`## methodName(args) -> ReturnType`) define methods.
 * Body text under each header provides documentation.
 *
 * The scanner is aware of fenced code blocks and blockquotes so that
 * headers inside those constructs are not mistaken for structure.
 */

/** @import { HelpText } from './help-text.js' */

import fs from 'fs';

/**
 * Extract the method name from a level-2 header line.
 * Expects patterns like "methodName(args) -> Type" or just "methodName".
 *
 * @param {string} headerText - The text after "## "
 * @returns {string} The method name (the identifier before the first '(')
 */
const extractMethodName = headerText => {
  const match = headerText.match(/^(\w+)/);
  if (!match) {
    return headerText.trim();
  }
  return match[1];
};

/**
 * Test whether a line opens or closes a fenced code block.
 * CommonMark fences are three or more backticks or tildes,
 * optionally preceded by up to three spaces.
 *
 * @param {string} line
 * @returns {boolean}
 */
const isFenceLine = line => /^ {0,3}(`{3,}|~{3,})/.test(line);

/**
 * Test whether a line is inside a blockquote (starts with `>`).
 *
 * @param {string} line
 * @returns {boolean}
 */
const isBlockquoteLine = line => /^ {0,3}>/.test(line);

/**
 * Parse a helpdown Markdown string into an array of [name, HelpText]
 * entries.
 *
 * Each level-1 header starts a new entity. The entity name is the first
 * whitespace-delimited token of the header (e.g. `EndoDirectory` from
 * `# EndoDirectory - A naming hub ...`). The empty-string key (`''`)
 * of the resulting HelpText record holds the full header text plus any
 * body paragraphs before the first level-2 header.
 *
 * Each level-2 header starts a new method entry. The method name is the
 * identifier before the first `(` (or the whole header if no parens).
 * The value is the header text plus any following body text.
 *
 * @param {string} text - Markdown source text
 * @returns {Array<[string, HelpText]>}
 */
export const parseHelpdown = text => {
  const lines = text.split('\n');
  /** @type {Array<[string, HelpText]>} */
  const entries = [];

  /** @type {string | undefined} */
  let currentEntityName;
  /** @type {HelpText | undefined} */
  let currentHelp;
  /** @type {string | undefined} */
  let currentKey;
  /** @type {string[]} */
  let currentLines = [];
  let inCodeFence = false;

  /**
   * Flush the accumulated lines into the current help record.
   *
   * For method entries (non-empty key), the first line is the method
   * signature. Any blank lines between the signature and the body are
   * markdown formatting and are collapsed so the output matches the
   * compact convention: "signature\nbody".
   *
   * For overview entries (empty-string key), blank lines are preserved
   * because they are part of the content structure.
   */
  const flush = () => {
    if (currentHelp !== undefined && currentKey !== undefined) {
      // Trim trailing blank lines
      while (
        currentLines.length > 0 &&
        currentLines[currentLines.length - 1] === ''
      ) {
        currentLines.pop();
      }
      // For method entries, collapse blank lines between signature
      // and body text.
      if (currentKey !== '' && currentLines.length > 1) {
        let bodyStart = 1;
        while (
          bodyStart < currentLines.length &&
          currentLines[bodyStart] === ''
        ) {
          bodyStart += 1;
        }
        if (bodyStart > 1) {
          currentLines.splice(1, bodyStart - 1);
        }
      }
      const value = currentLines.join('\n');
      currentHelp[currentKey] = value;
    }
    currentLines = [];
  };

  /**
   * Flush the current entity into the entries array.
   */
  const flushEntity = () => {
    flush();
    if (currentEntityName !== undefined && currentHelp !== undefined) {
      entries.push([currentEntityName, currentHelp]);
    }
  };

  for (const line of lines) {
    // Track fenced code blocks
    if (isFenceLine(line)) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }

    // Inside a code fence, accumulate without parsing headers
    if (inCodeFence) {
      currentLines.push(line);
      continue;
    }

    // Skip blockquote lines for header detection
    if (isBlockquoteLine(line)) {
      currentLines.push(line);
      continue;
    }

    // Level-1 header: new entity
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) {
      flushEntity();
      const headerText = h1Match[1];
      // Entity name is everything before " - " separator, or the
      // whole header if there is no separator.
      const dashIndex = headerText.indexOf(' - ');
      currentEntityName =
        dashIndex >= 0 ? headerText.slice(0, dashIndex) : headerText.trim();
      currentHelp = {};
      currentKey = '';
      // The overview text starts with the full H1 content
      currentLines = [headerText];
      continue;
    }

    // Level-2 header: new method within current entity
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      flush();
      const headerText = h2Match[1];
      currentKey = extractMethodName(headerText);
      currentLines = [headerText];
      continue;
    }

    // Body line: accumulate into current section
    currentLines.push(line);
  }

  // Flush any remaining content
  flushEntity();

  return entries;
};

/**
 * Read a helpdown Markdown file and yield [name, HelpText] entries.
 *
 * @param {string | URL} path - File path or URL to the Markdown file
 * @returns {AsyncIterable<[string, HelpText]>}
 */
export const loadHelpTextFile = path => {
  return harden({
    [Symbol.asyncIterator]: () => {
      /** @type {Array<[string, HelpText]> | undefined} */
      let entries;
      let index = 0;

      return harden({
        /** @returns {Promise<IteratorResult<[string, HelpText]>>} */
        next: async () => {
          if (entries === undefined) {
            const filePath =
              path instanceof URL ? path : new URL(path, import.meta.url);
            const text = await fs.promises.readFile(filePath, 'utf-8');
            entries = parseHelpdown(text);
          }
          if (index < entries.length) {
            const value = entries[index];
            index += 1;
            return harden({ value, done: false });
          }
          return harden({ value: undefined, done: true });
        },
      });
    },
  });
};

/**
 * Synchronously read and parse a helpdown Markdown file.
 *
 * @param {string | URL} path - File path or URL to the Markdown file
 * @returns {Map<string, HelpText>}
 */
export const readHelpTextFileSync = path => {
  const filePath =
    path instanceof URL ? path : new URL(path, import.meta.url);
  const text = fs.readFileSync(filePath, 'utf-8');
  const entries = parseHelpdown(text);
  return new Map(entries);
};

harden(parseHelpdown);
harden(loadHelpTextFile);
harden(readHelpTextFileSync);
