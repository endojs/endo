/* eslint-disable no-continue */
/**
 * Disallow exporting the same local binding under multiple names (value space only).
 * Allows single alias (e.g. `export { foo as bar }`).
 * Ignores re-exports (`export { x as y } from 'mod'`, `export * from 'mod'`)
 * and TS type exports.
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow exporting the same local binding under multiple names (local value exports only).',
      recommended: false,
    },
    schema: [],
    messages: {
      multiple:
        "Local binding '{{local}}' is exported under multiple names: {{names}}.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode(); // v9/v8 compat

    /** @type {Map<localName, Set<exportedNames>>} */
    const seen = new Map();

    const add = (localName, exportedName, node) => {
      let entry = seen.get(localName);
      if (!entry) {
        entry = new Set();
        seen.set(localName, entry);
      }
      const before = entry.size;
      entry.add(exportedName);
      if (entry.size > 1 && entry.size !== before) {
        context.report({
          node,
          messageId: 'multiple',
          data: { local: localName, names: Array.from(entry).join(', ') },
        });
      }
    };

    const getName = id => {
      if (!id) return null;
      if (id.type === 'Identifier') return id.name;
      if ('name' in id && typeof id.name === 'string') return id.name;
      if ('value' in id && typeof id.value === 'string') return id.value;
      return String(id);
    };

    return {
      ExportNamedDeclaration(node) {
        // Skip re-exports and type-only exports
        if (node.source) return;
        if (node.exportKind === 'type') return;

        // Track declaration exports (e.g. `export const a = 1;`)
        if (node.declaration) {
          const d = node.declaration;

          // function/class declarations
          if (
            (d.type === 'FunctionDeclaration' ||
              d.type === 'ClassDeclaration') &&
            d.id &&
            d.id.type === 'Identifier'
          ) {
            add(d.id.name, d.id.name, node);
          }

          // variable declarations (handles destructuring too)
          if (d.type === 'VariableDeclaration') {
            for (const v of sourceCode.getDeclaredVariables(d)) {
              if (v && typeof v.name === 'string') {
                add(v.name, v.name, node);
              }
            }
          }

          // Optional TS value-space cases (safe no-ops in plain JS)
          if (
            d.type === 'TSEnumDeclaration' &&
            d.id &&
            d.id.type === 'Identifier'
          ) {
            add(d.id.name, d.id.name, node);
          }
        }

        if (!node.specifiers) return;

        for (const spec of node.specifiers) {
          // Skip type-only specifiers (TS)
          if (spec.exportKind === 'type') continue;
          if (spec.type !== 'ExportSpecifier') continue;

          const localName = getName(spec.local);
          const exportedName = getName(spec.exported);
          if (!localName || !exportedName) continue;

          // Note: `export { x as default }` counts because it's a named export alias.
          add(localName, exportedName, spec);
        }
      },

      // Deliberately ignore `export default …` so it doesn't count as another name.
      // ExportDefaultDeclaration() {}
    };
  },
};
