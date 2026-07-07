import { createRule } from '../create-rule.js';

export default createRule({
  name: 'no-assign-to-exported-let-var-or-function',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow assignment to exported `let`/`var`/function bindings (including separately exported locals).',
    },
    schema: [],
    messages: {
      noAssign: "Assignment to exported binding '{{name}}' is disallowed.",
    },
  },
  defaultOptions: [],
  create(context) {
    const exportedVars = new Set();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    const findVariable = (scope, name) => {
      for (let s = scope; s; s = s.upper) {
        const found = s.variables.find(v => v.name === name);
        if (found) return found;
      }
      return null;
    };

    const isLetVarOrFunction = variable =>
      variable.defs.some(def => {
        if (def.type === 'Variable') {
          const declNode = def.parent;
          return (
            declNode && (declNode.kind === 'let' || declNode.kind === 'var')
          );
        }
        return def.type === 'FunctionName';
      });

    const collectDeclaredAndMark = nodeWithDecl => {
      for (const v of sourceCode.getDeclaredVariables(nodeWithDecl)) {
        if (isLetVarOrFunction(v)) {
          exportedVars.add(v);
        }
      }
    };

    const markLocalNameIfEligible = (nameNode, contextNode) => {
      const scope =
        (sourceCode.getScope && sourceCode.getScope(contextNode)) ??
        context.getScope();
      const variable = findVariable(scope, nameNode.name);
      if (variable && isLetVarOrFunction(variable)) {
        exportedVars.add(variable);
      }
    };

    const gatherAssignedIdentifiers = (pattern, acc = []) => {
      switch (pattern.type) {
        case 'Identifier':
          acc.push(pattern);
          break;
        case 'ArrayPattern':
          for (const elt of pattern.elements) {
            if (elt) gatherAssignedIdentifiers(elt, acc);
          }
          break;
        case 'ObjectPattern':
          for (const prop of pattern.properties) {
            if (prop.type === 'Property') {
              gatherAssignedIdentifiers(prop.value, acc);
            } else if (prop.type === 'RestElement') {
              gatherAssignedIdentifiers(prop.argument, acc);
            }
          }
          break;
        case 'AssignmentPattern':
          gatherAssignedIdentifiers(pattern.left, acc);
          break;
        case 'RestElement':
          gatherAssignedIdentifiers(pattern.argument, acc);
          break;
        default:
          break;
      }
      return acc;
    };

    const maybeReportIdentifier = (idNode, contextNode) => {
      const scope =
        (sourceCode.getScope && sourceCode.getScope(contextNode)) ??
        context.getScope();
      const variable = findVariable(scope, idNode.name);
      if (variable && exportedVars.has(variable)) {
        context.report({
          node: idNode,
          messageId: 'noAssign',
          data: { name: idNode.name },
        });
      }
    };

    return {
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (
            node.declaration.type === 'VariableDeclaration' &&
            (node.declaration.kind === 'let' || node.declaration.kind === 'var')
          ) {
            collectDeclaredAndMark(node.declaration);
          } else if (node.declaration.type === 'FunctionDeclaration') {
            collectDeclaredAndMark(node.declaration);
          }
        }

        if (!node.source && node.specifiers?.length) {
          for (const spec of node.specifiers) {
            if (spec.type === 'ExportSpecifier') {
              markLocalNameIfEligible(spec.local, node);
            }
          }
        }
      },

      AssignmentExpression(node) {
        for (const id of gatherAssignedIdentifiers(node.left)) {
          if (id.type === 'Identifier') {
            maybeReportIdentifier(id, node);
          }
        }
      },

      UpdateExpression(node) {
        if (node.argument?.type === 'Identifier') {
          maybeReportIdentifier(node.argument, node);
        }
      },
    };
  },
});
