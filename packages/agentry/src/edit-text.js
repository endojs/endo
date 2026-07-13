// @ts-check
/**
 * LLM-friendly text editing by exact-string replacement, modeled on Pi's
 * `coding-agent/src/core/tools/edit.ts`
 * (`applyEditsToNormalizedContent` + `computeEditsDiff`).
 *
 * This module is pure: it takes the current text of a file and a list of
 * `{ oldText, newText }` edits and returns the new text plus a unified diff.
 * It performs no I/O, so it can back both the Fae node-fs tool surface and the
 * Lal capability tool surface (`readText`/`writeText` on a tree capability).
 *
 * Semantics borrowed from Pi (see designs/endopi-edit-tool.md):
 *
 * - **Unique match required.** Each `oldText` must occur exactly once in the
 *   file. Zero matches or more than one match is a structured error, so the
 *   agent must add disambiguating context rather than silently editing the
 *   wrong site.
 * - **No overlap between edits in one call.** The byte ranges the edits target
 *   (computed against the original text) must not overlap; overlap — including
 *   two edits with the same `oldText` — is a structured error.
 * - **Line-ending preservation.** Matching is done against an LF-normalized
 *   copy; the file's original dominant line ending (CRLF vs LF) is restored on
 *   the way out, and a leading BOM is preserved if present.
 */

/**
 * @typedef {object} TextEdit
 * @property {string} oldText - Unique snippet to replace.
 * @property {string} newText - Replacement text.
 */

/**
 * @typedef {object} EditResult
 * @property {string} content - The full new file content (line endings and BOM
 *   restored to match the original).
 * @property {string} diff - A unified diff of the applied changes, LF-normalized.
 * @property {number} applied - Number of edits applied (always equal to the
 *   number of edits requested on success).
 */

const BOM = '\uFEFF';

/**
 * Detect the dominant line ending of a text. Returns `'\r\n'` when the first
 * line break in the text is a CRLF, `'\n'` otherwise (including a text with no
 * line breaks at all).
 *
 * @param {string} text
 * @returns {'\r\n' | '\n'}
 */
const detectLineEnding = text => {
  const i = text.indexOf('\n');
  if (i > 0 && text[i - 1] === '\r') {
    return '\r\n';
  }
  return '\n';
};

/** @param {string} text */
const normalizeToLf = text => text.replace(/\r\n/g, '\n');

/**
 * Find every start index at which `needle` occurs in `haystack`.
 *
 * @param {string} haystack
 * @param {string} needle
 * @returns {number[]}
 */
const findAllIndexes = (haystack, needle) => {
  /** @type {number[]} */
  const indexes = [];
  if (needle.length === 0) {
    return indexes;
  }
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) {
      break;
    }
    indexes.push(i);
    // Advance by one so overlapping occurrences are all counted (matters for
    // the uniqueness check: "aa" occurs twice in "aaa").
    from = i + 1;
  }
  return indexes;
};

/**
 * Compute a unified diff between two LF-normalized texts using a longest-common-
 * subsequence line alignment. Emits standard unified-diff hunk headers with up
 * to `context` unchanged lines around each change. Returns the empty string
 * when the texts are identical.
 *
 * @param {string} beforeLf
 * @param {string} afterLf
 * @param {object} [options]
 * @param {number} [options.context] - Unchanged context lines per hunk side.
 * @param {string} [options.fileName] - Name for the `---`/`+++` headers.
 * @returns {string}
 */
export const computeUnifiedDiff = (beforeLf, afterLf, options = {}) => {
  const { context = 3, fileName = 'file' } = options;
  if (beforeLf === afterLf) {
    return '';
  }
  // Split into lines, dropping a single trailing newline so a file ending in
  // "\n" does not produce a spurious empty last line.
  /**
   * @param {string} text
   * @returns {string[]}
   */
  const splitLines = text =>
    text.length === 0 ? [] : text.replace(/\n$/, '').split('\n');
  const a = splitLines(beforeLf);
  const b = splitLines(afterLf);

  // LCS dynamic-programming table over lines.
  const n = a.length;
  const m = b.length;
  /** @type {number[][]} */
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  // Walk the table to produce a line-level op list: ' ' (equal), '-' (delete
  // from a), '+' (insert from b).
  /** @type {{ op: ' ' | '-' | '+', text: string }[]} */
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: ' ', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ op: '-', text: a[i] });
      i += 1;
    } else {
      ops.push({ op: '+', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ op: '-', text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ op: '+', text: b[j] });
    j += 1;
  }

  // Group ops into hunks: runs of changes plus up to `context` surrounding
  // unchanged lines, merging hunks whose contexts touch.
  /** @type {{ op: ' ' | '-' | '+', text: string }[][]} */
  const hunks = [];
  let cursor = 0;
  while (cursor < ops.length) {
    if (ops[cursor].op === ' ') {
      cursor += 1;
    } else {
      // Found a change at `cursor`. Extend to the end of the changed region,
      // absorbing unchanged gaps no larger than 2*context (so adjacent changes
      // stay in one hunk).
      const start = cursor;
      let end = cursor;
      let extending = true;
      while (extending && end < ops.length) {
        if (ops[end].op !== ' ') {
          end += 1;
        } else {
          // Count the run of unchanged lines starting at `end`.
          let gap = end;
          while (gap < ops.length && ops[gap].op === ' ') {
            gap += 1;
          }
          const hasMoreChanges = gap < ops.length;
          if (hasMoreChanges && gap - end <= context * 2) {
            end = gap;
          } else {
            extending = false;
          }
        }
      }
      // Add leading/trailing context.
      const from = Math.max(0, start - context);
      const to = Math.min(ops.length, end + context);
      hunks.push(ops.slice(from, to));
      cursor = to;
    }
  }

  // Render hunks, tracking line numbers in a and b.
  const lines = [`--- a/${fileName}`, `+++ b/${fileName}`];
  // Precompute, for each op index, the 1-based line numbers.
  let aLine = 1;
  let bLine = 1;
  /** @type {{ aStart: number, bStart: number }[]} */
  const lineStarts = [];
  for (const op of ops) {
    lineStarts.push({ aStart: aLine, bStart: bLine });
    if (op.op === ' ') {
      aLine += 1;
      bLine += 1;
    } else if (op.op === '-') {
      aLine += 1;
    } else {
      bLine += 1;
    }
  }
  const indexOf = new Map();
  ops.forEach((op, idx) => indexOf.set(op, idx));
  for (const hunk of hunks) {
    const firstIdx = indexOf.get(hunk[0]);
    const starts = lineStarts[firstIdx];
    let aCount = 0;
    let bCount = 0;
    for (const op of hunk) {
      if (op.op !== '+') aCount += 1;
      if (op.op !== '-') bCount += 1;
    }
    // A zero-length side still reports its anchor line per unified-diff custom.
    const aStart = aCount === 0 ? starts.aStart - 1 : starts.aStart;
    const bStart = bCount === 0 ? starts.bStart - 1 : starts.bStart;
    lines.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const op of hunk) {
      lines.push(`${op.op}${op.text}`);
    }
  }
  return `${lines.join('\n')}\n`;
};
harden(computeUnifiedDiff);

/**
 * Apply a batch of exact-string-replacement edits to a text.
 *
 * @param {string} original - The current file content.
 * @param {TextEdit[]} edits - Edits to apply; each `oldText` must occur exactly
 *   once, and the edits must not target overlapping ranges.
 * @param {object} [options]
 * @param {string} [options.fileName] - Name used in the returned diff headers.
 * @returns {EditResult}
 * @throws {Error} If any `oldText` is empty, not found, non-unique, or if two
 *   edits overlap.
 */
export const applyEdits = (original, edits, options = {}) => {
  const { fileName = 'file' } = options;
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('At least one edit is required.');
  }

  const hasBom = original.startsWith(BOM);
  const withoutBom = hasBom ? original.slice(BOM.length) : original;
  const lineEnding = detectLineEnding(withoutBom);
  const beforeLf = normalizeToLf(withoutBom);

  // Resolve each edit to a unique range in the original (LF-normalized) text.
  /** @type {{ start: number, end: number, replacement: string, oldText: string }[]} */
  const ranges = [];
  edits.forEach((edit, idx) => {
    const { oldText, newText } = edit;
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new Error(`Edit ${idx + 1}: oldText and newText must be strings.`);
    }
    if (oldText.length === 0) {
      throw new Error(
        `Edit ${idx + 1}: oldText must be a non-empty string to match uniquely.`,
      );
    }
    const oldLf = normalizeToLf(oldText);
    const matches = findAllIndexes(beforeLf, oldLf);
    if (matches.length === 0) {
      throw new Error(
        `Edit ${idx + 1}: oldText not found in ${fileName}. It must match the file exactly (including whitespace).`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Edit ${idx + 1}: oldText matches ${matches.length} locations in ${fileName}; add surrounding context so it matches exactly one.`,
      );
    }
    ranges.push({
      start: matches[0],
      end: matches[0] + oldLf.length,
      replacement: normalizeToLf(newText),
      oldText: oldLf,
    });
  });

  // Detect overlap between edit ranges (covers duplicate oldText across edits).
  const ordered = [...ranges].sort((x, y) => x.start - y.start);
  for (let k = 1; k < ordered.length; k += 1) {
    if (ordered[k].start < ordered[k - 1].end) {
      throw new Error(
        `Edits overlap in ${fileName}: two edits target the same or overlapping text. Apply them separately or merge them into one edit.`,
      );
    }
  }

  // Apply from the end so earlier offsets stay valid.
  let afterLf = beforeLf;
  for (let k = ordered.length - 1; k >= 0; k -= 1) {
    const { start, end, replacement } = ordered[k];
    afterLf = afterLf.slice(0, start) + replacement + afterLf.slice(end);
  }

  const diff = computeUnifiedDiff(beforeLf, afterLf, { fileName });

  // Restore original line endings and BOM.
  const restored =
    lineEnding === '\r\n' ? afterLf.replace(/\n/g, '\r\n') : afterLf;
  const content = hasBom ? BOM + restored : restored;

  return harden({ content, diff, applied: edits.length });
};
harden(applyEdits);

/**
 * Normalize the two accepted call shapes into a `TextEdit[]`:
 * a single `{ oldText, newText }` pair, or an `edits` array of them (Pi accepts
 * both; see designs/endopi-edit-tool.md § Open questions).
 *
 * @param {object} args
 * @param {string} [args.oldText]
 * @param {string} [args.newText]
 * @param {TextEdit[]} [args.edits]
 * @returns {TextEdit[]}
 */
export const normalizeEdits = ({ oldText, newText, edits }) => {
  if (Array.isArray(edits) && edits.length > 0) {
    return harden(edits);
  }
  if (oldText !== undefined || newText !== undefined) {
    // Require both halves of the single-pair shape (no `?? ''` coercion): an
    // omitted newText is rejected here rather than silently deleting oldText,
    // matching the `edits` array shape and Lal's required `newText`. An
    // explicit `newText: ''` (a deletion) still passes. The guard also narrows
    // both to `string`, so the returned literal is a `TextEdit[]`.
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new Error(
        'A single edit requires both `oldText` and `newText` to be strings.',
      );
    }
    return harden([{ oldText, newText }]);
  }
  throw new Error(
    'Provide either an `edits` array or a single `oldText`/`newText` pair.',
  );
};
harden(normalizeEdits);
