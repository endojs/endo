import * as babelParser from '@babel/parser';
import babelGenerate from '@agoric/babel-generator';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';

// Don't look at me, I just copied it
const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

function rewriteComment(node) {
  node.type = 'CommentBlock';
  // No need for comments at runtime
  node.value = '';
}
function transformAst(ast) {
  (babelTraverse.default || babelTraverse)(ast, {
    enter(p) {
      const { comments, leadingComments, innerComments, trailingComments } =
        p.node;
      // Let modules use the tamed eval
      if (p.node.name === 'eval' && !p.parentPath.isSequenceExpression()) {
        p.replaceWith(t.sequenceExpression([t.numericLiteral(0), t.identifier('eval')]))
      }
      // Defuse import statement triggers in string literals without affecting the resulting string
      if (p.node.type === 'StringLiteral') {
        p.node.value = p.node.value.replace(/import\(/g, 'import\\(');
      }
      // Rewrite all comments.
      (comments || []).forEach((node) => rewriteComment(node));
      (leadingComments || []).forEach((node) => rewriteComment(node));
      if (p.node.type.startsWith('Comment')) {
        rewriteComment(p.node);
      }
      (innerComments || []).forEach((node) => rewriteComment(node));
      (trailingComments || []).forEach((node) => rewriteComment(node));
    },
  });
}

export function transformSource(code, { sourceType } = {}) {
  const ast = parseBabel(code, {
    sourceType,
    allowReturnOutsideFunction: true,
  });

  transformAst(ast);

  return (babelGenerate.default || babelGenerate)(ast, {
    retainLines: true,
  });
}


const importsTransform = (sourceType, parser) => sourceBytes => {
  const source = new TextDecoder().decode(sourceBytes);
  const object = transformSource(source, { sourceType });
  const objectBytes = new TextEncoder().encode(object.code);

  return { bytes: objectBytes, parser };
};
export const moduleTransforms = {
  mjs: importsTransform('module', 'mjs'),
  cjs: importsTransform('script', 'cjs'),
};
