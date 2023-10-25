/**
 * Provides {@link transformComment} which evades SES restrictions by modifying
 * a Babel AST Node.
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
 * @param {import('./location-unmapper.js').LocationUnmapper} [unmapLoc]
 */
export function transformComment(node, unmapLoc) {
  node.type = 'CommentBlock';
  // Within comments...
  node.value = node.value
    // ...strip extraneous comment whitespace
    .replace(/^\s+/gm, ' ')
    // ...replace HTML comments with a defanged version to pass SES restrictions.
    .replace(HTML_COMMENT_START_RE, '<!\u{2010}-')
    .replace(HTML_COMMENT_END_RE, '-\u{2010}>')
    // ...replace import expressions with a defanged version to pass SES restrictions
    // (featuring homoglyphs for @kriskowal)
    .replace(IMPORT_RE, 'im\u{440}ort$2')
    // ...replace end-of-comment markers
    .replace(/\*\//g, '*X/');
  if (unmapLoc) {
    unmapLoc(node.loc);
  }
}
