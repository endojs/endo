/**
 * Provides {@link evadeComment} and {@link elideComment} which evade SES
 * restrictions by modifying a Babel AST Node.
 *
 * @module
 */

/**
 * Matches `import(...)` expressions in comments (e.g., TS types in JSDoc)
 */
const IMPORT_RE = new RegExp('\\b(import)(\\s*(?:\\(|/[/*]))', 'sg');

/**
 * Matches the start of an HTML comment in a JS comment
 */
const HTML_COMMENT_START_RE = new RegExp(`${'<'}!--`, 'g');

/**
 * Matches the end of an HTML comment in a JS comment
 */
const HTML_COMMENT_END_RE = new RegExp(`--${'>'}`, 'g');

/**
 * Rewrites a Comment Node to avoid triggering SES restrictions.
 *
 * Apparently coerces all comments to block comments.
 *
 * @param {import('@babel/types').Comment} node
 */
export function evadeComment(node) {
  node.type = 'CommentBlock';
  // Within comments...
  node.value = node.value
    // ...strip extraneous comment whitespace
    .replace(/^\s+/gm, ' ')
    // ...replace HTML comments with a defanged version to pass SES restrictions.
    .replace(HTML_COMMENT_START_RE, '<!=-')
    .replace(HTML_COMMENT_END_RE, '-=>')
    // ...replace import expressions with a defanged version to pass SES restrictions
    // (featuring homoglyphs for @kriskowal)
    .replace(IMPORT_RE, 'IMPORT$2')
    // ...replace end-of-comment markers
    .replace(/\*\//g, '*X/');
}

/**
 * Inspects a comment for a hint that it must be preserved by a transform.
 *
 * @param {string} comment
 */
const markedForPreservation = comment => {
  if (comment.startsWith('!')) {
    return true;
  }
  if (comment.startsWith('*')) {
    // Detect jsdoc style @preserve, @copyright, @license, @cc_on (IE
    // cconditional comments)
    return /(?:^|\n)\s*\*?\s*@(?:preserve|copyright|license|cc_on)\b/.test(
      comment,
    );
  }
  return false;
};

/**
 * Elides all non-newlines before the last line and replaces all non-newlines
 * with spaces on the last line.
 * This can greatly reduce the size of a well-commented artifact without
 * displacing lines or columns in the transformed code.
 *
 * @param {import('@babel/types').Comment} node
 */
export const elideComment = node => {
  if (node.type === 'CommentBlock') {
    if (!markedForPreservation(node.value)) {
      node.value = node.value.replace(/[^\n]+\n/g, '\n').replace(/[^\n]/g, ' ');
    }
  } else {
    node.value = '';
  }
};
