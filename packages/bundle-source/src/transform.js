import * as babelParser from '@babel/parser';
import babelGenerate from '@agoric/babel-generator';
import babelTraverse from '@babel/traverse';
import SourceMaps from 'source-map';

const SourceMapConsumer = SourceMaps.SourceMapConsumer;
const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

const IMPORT_RE = new RegExp('\\b(import)(\\s*(?:\\(|/[/*]))', 'sg');
const HTML_COMMENT_START_RE = new RegExp(`${'<'}!--`, 'g');
const HTML_COMMENT_END_RE = new RegExp(`--${'>'}`, 'g');

function rewriteComment(node, unmapLoc) {
  node.type = 'CommentBlock';
  // Within comments...
  node.value = node.value
    // ...strip extraneous comment whitespace
    .replace(/^\s+/gm, ' ')
    // ...replace HTML comments with a defanged version to pass SES restrictions.
    .replace(HTML_COMMENT_START_RE, '<!X-')
    .replace(HTML_COMMENT_END_RE, '-X>')
    // ...replace import expressions with a defanged version to pass SES restrictions.
    .replace(IMPORT_RE, 'X$1$2')
    // ...replace end-of-comment markers
    .replace(/\*\//g, '*X/');
  if (unmapLoc) {
    unmapLoc(node.loc);
  }
  // console.log(JSON.stringify(node, undefined, 2));
}

async function makeLocationUnmapper({ sourceMap, ast }) {
  // We rearrange the rolled-up chunk according to its sourcemap to move
  // its source lines back to the right place.
  // eslint-disable-next-line no-await-in-loop
  const consumer = await new SourceMapConsumer(sourceMap);
  try {
    const unmapped = new WeakSet();
    let lastPos = { ...ast.loc.start };
    return loc => {
      if (!loc || unmapped.has(loc)) {
        return;
      }
      // Make sure things start at least at the right place.
      loc.end = { ...loc.start };
      for (const pos of ['start', 'end']) {
        if (loc[pos]) {
          const newPos = consumer.originalPositionFor(loc[pos]);
          if (newPos.source !== null) {
            lastPos = {
              line: newPos.line,
              column: newPos.column,
            };
          }
          loc[pos] = lastPos;
        }
      }
      unmapped.add(loc);
    };
  } finally {
    consumer.destroy();
  }
}

function transformAst(ast, unmapLoc) {
  (babelTraverse.default || babelTraverse)(ast, {
    enter(p) {
      const {
        loc,
        comments,
        leadingComments,
        innerComments,
        trailingComments,
      } = p.node;
      (comments || []).forEach(node => rewriteComment(node, unmapLoc));
      // Rewrite all comments.
      (leadingComments || []).forEach(node => rewriteComment(node, unmapLoc));
      if (p.node.type.startsWith('Comment')) {
        rewriteComment(p.node, unmapLoc);
      }
      (innerComments || []).forEach(node => rewriteComment(node, unmapLoc));
      // If not a comment, and we are unmapping the source maps,
      // then do it for this location.
      if (unmapLoc) {
        unmapLoc(loc);
      }
      (trailingComments || []).forEach(node => rewriteComment(node, unmapLoc));
    },
  });
}

export async function transformSource(
  code,
  { sourceMap, sourceMapUrl, useLocationUnmap, sourceType } = {},
) {
  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const ast = parseBabel(code, {
    sourceType,
  });

  let unmapLoc;
  if (useLocationUnmap) {
    unmapLoc = await makeLocationUnmapper({
      sourceMap,
      ast,
    });
  }

  transformAst(ast, unmapLoc);

  // Now generate the sources with the new positions.
  return (babelGenerate.default || babelGenerate)(ast, {
    sourceFileName: sourceMapUrl,
    sourceMaps: true,
    retainLines: true,
    compact: true,
  });
}
