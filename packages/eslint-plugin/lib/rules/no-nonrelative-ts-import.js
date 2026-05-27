/**
 * Disallow `.ts` (or `.mts`/`.cts`) import/export specifiers on non-relative
 * paths. Node.js refuses to resolve `.ts` specifiers under `node_modules`, and
 * Endo packages publish `.js` (types erased at pack time), so a bare/package
 * `.ts` specifier breaks for consumers — and for this repo once the dependency
 * is consumed as a published package. `.ts` may only be imported by relative
 * path within the same package (or another workspace package in this repo);
 * reach other packages through their published entrypoint. See
 * `docs/typescript.md`.
 */

'use strict';

const TS_EXTENSION = /\.[mc]?ts$/;

const isRelative = specifier =>
  specifier.startsWith('./') || specifier.startsWith('../');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `.ts` import specifiers on non-relative paths (Node.js cannot resolve `.ts` under `node_modules`).',
      recommended: false,
    },
    schema: [],
    messages: {
      nonRelativeTs:
        "Non-relative '.ts' import specifier '{{specifier}}'. Node.js cannot resolve '.ts' under node_modules; use a relative specifier within the repo, or import the package's published entrypoint.",
    },
  },

  create(context) {
    const check = sourceNode => {
      if (!sourceNode || sourceNode.type !== 'Literal') return;
      const { value } = sourceNode;
      if (typeof value !== 'string') return;
      if (!TS_EXTENSION.test(value)) return;
      if (isRelative(value)) return;
      context.report({
        node: sourceNode,
        messageId: 'nonRelativeTs',
        data: { specifier: value },
      });
    };

    return {
      // import ... from '...'; and import type ... from '...';
      ImportDeclaration: node => check(node.source),
      // export ... from '...'; and export type ... from '...';
      ExportNamedDeclaration: node => check(node.source),
      // export * from '...';
      ExportAllDeclaration: node => check(node.source),
      // dynamic import('...') with a static string argument
      ImportExpression: node => check(node.source),
    };
  },
};
