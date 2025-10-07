/**
 * Disallow assignment to exported let/var/function bindings.
 *
 * Flags all assignments/updates to identifiers that resolve to a local binding
 * which is exported (either inline or via a separate `export { ... }`)
 * and whose original declaration is a `let`, `var`, or `function` declaration.
 *
 * Examples that will be reported:
 *   export let x = 1; x = 2; x++;
 *   let y; export { y }; ({ y } = obj);
 *   function f() {} export { f }; f = other;
 *   export var z = 0; z += 1;
 *
 * Note: does NOT flag property writes like `obj.x = 1`, only direct binding writes.
 */

'use strict';

/**
 * @import { Rule } from "eslint";
 * @import {
 *   Node,
 *   Identifier,
 *   Pattern,
 *   ExportNamedDeclaration,
 *   AssignmentExpression,
 *   UpdateExpression
 * } from "estree";
 * @import { Scope, Variable } from "eslint-scope";
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow assignment to exported let/var/function bindings (including separately exported locals).',
      recommended: false,
    },
    schema: [], // no options for now
    messages: {
      noAssign: "Assignment to exported binding '{{name}}' is disallowed.",
    },
  },

  /**
   * @param {Rule.RuleContext} context
   */
  create(context) {
    /** @type {Set<Variable>} Set of eslint-scope Variable objects that are exported */
    const exportedVars = new Set();

    const sourceCode = context.sourceCode ?? context.getSourceCode(); // v9/v8 compat

    /**
     * Find a variable by name starting from a given scope and walking up.
     * @param {Scope} scope
     * @param {string} name
     * @returns {Variable | null}
     */
    function findVariable(scope, name) {
      for (let s = scope; s; s = s.upper) {
        const found = s.variables.find(v => v.name === name);
        if (found) return found;
      }
      return null;
    }

    /**
     * True if a Variable’s definition is a let/var or a function declaration.
     * @param {Variable} variable
     * @returns {boolean}
     */
    function isLetVarOrFunction(variable) {
      return variable.defs.some(def => {
        if (def.type === 'Variable') {
          const declNode = def.parent; // VariableDeclaration
          return (
            declNode && (declNode.kind === 'let' || declNode.kind === 'var')
          );
        }
        // Function declaration
        if (def.type === 'FunctionName') {
          return true;
        }
        return false;
      });
    }

    /**
     * Collect variables declared by a node and, if eligible, mark them exported.
     * @param {Node} nodeWithDecl
     * @returns {void}
     */
    function collectDeclaredAndMark(nodeWithDecl) {
      const vars = sourceCode.getDeclaredVariables(nodeWithDecl);
      for (const v of vars) {
        if (isLetVarOrFunction(v)) {
          exportedVars.add(v);
        }
      }
    }

    /**
     * Record a local name (from an export specifier) as exported if eligible.
     * @param {Identifier} nameNode
     * @returns {void}
     */
    function markLocalNameIfEligible(nameNode) {
      const scope = context.getScope();
      const variable = findVariable(scope, nameNode.name);
      if (variable && isLetVarOrFunction(variable)) {
        exportedVars.add(variable);
      }
    }

    /**
     * Extract all identifiers on the left side of an Assignment target (handles patterns).
     * @param {Pattern | Node} pattern
     * @param {Identifier[]} [acc]
     * @returns {Identifier[]}
     */
    function gatherAssignedIdentifiers(pattern, acc) {
      acc = acc || [];
      if (!pattern) return acc;

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
          // Non-binding LHS targets (e.g., MemberExpression) – intentionally do nothing
          break;
      }
      return acc;
    }

    /**
     * Report if the identifier resolves to one of the exported variables.
     * @param {Identifier} idNode
     * @returns {void}
     */
    function maybeReportIdentifier(idNode) {
      const scope = context.getScope();
      const variable = findVariable(scope, idNode.name);
      if (variable && exportedVars.has(variable)) {
        context.report({
          node: idNode,
          messageId: 'noAssign',
          data: { name: idNode.name },
        });
      }
    }

    return {
      // Collect directly exported declarations, e.g.:
      //   export let x = 1;
      //   export var y = 0;
      //   export function f() {}
      /**
       * @param {ExportNamedDeclaration} node
       */
      ExportNamedDeclaration(node) {
        // Case 1: inline declaration export
        if (node.declaration) {
          // Only add if kind is let/var OR function decl
          if (
            node.declaration.type === 'VariableDeclaration' &&
            (node.declaration.kind === 'let' || node.declaration.kind === 'var')
          ) {
            collectDeclaredAndMark(node.declaration);
          } else if (node.declaration.type === 'FunctionDeclaration') {
            collectDeclaredAndMark(node.declaration);
          }
        }

        // Case 2: `export { local as exported }` (only when source == null; otherwise it's a re-export)
        if (!node.source && node.specifiers && node.specifiers.length > 0) {
          for (const spec of node.specifiers) {
            if (spec.type === 'ExportSpecifier') {
              // spec.local is the local binding in this module
              markLocalNameIfEligible(spec.local);
            }
          }
        }
      },

      // Assignments like `x = ...`, `x += ...`, `({x} = obj)`, `[x] = arr`, etc.
      /**
       * @param {AssignmentExpression} node
       */
      AssignmentExpression(node) {
        const ids = gatherAssignedIdentifiers(node.left, []);
        for (const id of ids) {
          if (id.type === 'Identifier') {
            maybeReportIdentifier(id);
          }
        }
      },

      // Updates like `x++`, `--x`
      /**
       * @param {UpdateExpression} node
       */
      UpdateExpression(node) {
        if (node.argument && node.argument.type === 'Identifier') {
          maybeReportIdentifier(node.argument);
        }
      },
    };
  },
};
