/* eslint-disable no-continue */
import { createRule } from '../create-rule.js';

export default createRule({
  name: 'no-multi-name-local-export',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow exporting the same local binding under multiple names (local value exports only).',
    },
    schema: [],
    messages: {
      multiple:
        "Local binding '{{local}}' is exported under multiple names: {{names}}.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Tracks each local name → set of exported names seen so far. */
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
        // Skip re-exports and type-only exports.
        if (node.source) return;
        if (node.exportKind === 'type') return;

        if (node.declaration) {
          const d = node.declaration;

          if (
            (d.type === 'FunctionDeclaration' ||
              d.type === 'ClassDeclaration') &&
            d.id?.type === 'Identifier'
          ) {
            add(d.id.name, d.id.name, node);
          }

          if (d.type === 'VariableDeclaration') {
            for (const v of sourceCode.getDeclaredVariables(d)) {
              if (v && typeof v.name === 'string') {
                add(v.name, v.name, node);
              }
            }
          }

          if (d.type === 'TSEnumDeclaration' && d.id?.type === 'Identifier') {
            add(d.id.name, d.id.name, node);
          }
        }

        if (!node.specifiers) return;

        for (const spec of node.specifiers) {
          if (spec.exportKind === 'type') continue;
          if (spec.type !== 'ExportSpecifier') continue;

          const localName = getName(spec.local);
          const exportedName = getName(spec.exported);
          if (!localName || !exportedName) continue;

          add(localName, exportedName, spec);
        }
      },
    };
  },
});
