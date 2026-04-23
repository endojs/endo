/* eslint max-lines: 0 */

/**
 * Babel plugin for analyzing and transforming CommonJS module source code.
 *
 * Provides the CJS counterpart to {@link makeModulePlugins} in
 * `babel-plugin.js`. Creates paired analyze/transform Babel plugins that detect
 * CJS patterns (`require()`, `exports`, `module.exports`,
 * `Object.defineProperty`, Babel/TS reexport helpers, esbuild hints) and
 * rewrite `import()` calls for SES evasion.
 *
 * @module
 */

import * as h from './hidden.js';

/**
 * @import {CjsTransformSourceParams, PluginFactory} from './types/module-source.js'
 * @import {Node,
 *  CallExpression,
 *  Expression,
 *  PrivateName,
 *  MemberExpression,
 *  ObjectProperty,
 *  ObjectMethod,
 *  BlockStatement,
 *  ObjectExpression,
 *  Identifier,
 * } from '@babel/types'
 */

const strictReserved = new Set([
  'implements',
  'interface',
  'let',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'yield',
  'enum',
]);

/**
 * @param {string} name
 * @returns {boolean}
 */
const isValidExportName = name => {
  if (strictReserved.has(name)) return false;
  return /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u.test(name);
};

/**
 * @param {Expression | PrivateName} node
 * @param {boolean} computed
 * @returns {string | null}
 */
const getPropertyKeyName = (node, computed) => {
  if (computed) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
};

/**
 * @param {CallExpression} node
 * @returns {string | null}
 */
const getStringCallArg = node => {
  if (node.arguments.length !== 1) return null;
  const arg = node.arguments[0];
  if (arg.type === 'StringLiteral') return arg.value;
  return null;
};

/**
 * @param {CallExpression} node
 * @returns {boolean}
 */
const isRequireCall = node =>
  node.callee.type === 'Identifier' &&
  node.callee.name === 'require' &&
  node.arguments.length >= 1 &&
  node.arguments[0].type === 'StringLiteral';

/**
 * @param {Node} node
 * @param {string} obj
 * @param {string} prop
 * @returns {boolean}
 */
const isMember = (node, obj, prop) =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  node.object.name === obj &&
  node.property.type === 'Identifier' &&
  node.property.name === prop;

/**
 * @param {Node} node
 * @returns {boolean}
 */
const isModuleExports = node => isMember(node, 'module', 'exports');

/**
 * @param {Node} node
 * @returns {boolean}
 */
const isExportsIdentifier = node =>
  node.type === 'Identifier' && node.name === 'exports';

/**
 * @param {MemberExpression} node
 * @returns {string | null}
 */
const getMemberPropertyName = node => {
  if (node.computed) {
    if (node.property.type === 'StringLiteral') return node.property.value;
    return null;
  }
  if (node.property.type === 'Identifier') return node.property.name;
  return null;
};

/**
 * @param {Node} node
 * @param {string} keyParam
 * @returns {boolean}
 */
const isExportsBracketAccess = (node, keyParam) =>
  node.type === 'MemberExpression' &&
  node.computed === true &&
  isExportsIdentifier(node.object) &&
  node.property.type === 'Identifier' &&
  node.property.name === keyParam;

/**
 * @param {Node} node
 * @param {string} objName
 * @param {string} keyParam
 * @returns {boolean}
 */
const isBracketAccess = (node, objName, keyParam) =>
  node.type === 'MemberExpression' &&
  node.computed === true &&
  node.object.type === 'Identifier' &&
  node.object.name === objName &&
  node.property.type === 'Identifier' &&
  node.property.name === keyParam;

/**
 * Extracts the BlockStatement body from a getter property (either an
 * ObjectMethod or an ObjectProperty with a function/arrow value).
 *
 * @param {ObjectProperty | ObjectMethod} prop
 * @returns {BlockStatement | null}
 */
const extractGetterBody = prop => {
  if (prop.type === 'ObjectMethod') {
    return prop.body;
  }
  if (
    prop.type === 'ObjectProperty' &&
    (prop.value.type === 'FunctionExpression' ||
      prop.value.type === 'ArrowFunctionExpression') &&
    prop.value.body.type === 'BlockStatement'
  ) {
    return prop.value.body;
  }
  return null;
};

/**
 * @param {ObjectExpression} node
 * @param {Set<string>} exportsSet
 * @param {Set<string>} reexportsSet
 * @param {string[]} requiresList
 */
const collectObjectExports = (node, exportsSet, reexportsSet, requiresList) => {
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const arg = prop.argument;
      if (arg.type === 'CallExpression' && isRequireCall(arg)) {
        const specifier = getStringCallArg(arg);
        if (specifier !== null) {
          reexportsSet.add(specifier);
          requiresList.push(specifier);
        }
      }
    } else if (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') {
      const name = getPropertyKeyName(prop.key, prop.computed);
      if (name !== null && isValidExportName(name)) {
        exportsSet.add(name);
      }
    }
  }
};

/**
 * @param {ObjectExpression} descriptorNode
 * @returns {boolean}
 */
const hasUnsafeGetter = descriptorNode => {
  let hasGetter = false;
  let getterIsSafe = false;
  let hasValue = false;
  let hasEnumerableFalse = false;

  for (const prop of descriptorNode.properties) {
    if (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') {
      const keyName = getPropertyKeyName(prop.key, prop.computed);

      if (keyName === 'value') {
        hasValue = true;
      } else if (keyName === 'enumerable') {
        if (
          prop.type === 'ObjectProperty' &&
          prop.value.type === 'BooleanLiteral' &&
          prop.value.value === false
        ) {
          hasEnumerableFalse = true;
        }
      } else if (keyName === 'get') {
        hasGetter = true;
        const body = extractGetterBody(prop);

        if (body && body.body.length === 1) {
          const stmt = body.body[0];
          if (
            stmt.type === 'ReturnStatement' &&
            stmt.argument &&
            stmt.argument.type === 'MemberExpression'
          ) {
            const mem = stmt.argument;
            if (
              mem.object.type === 'Identifier' &&
              ((!mem.computed && mem.property.type === 'Identifier') ||
                (mem.computed && mem.property.type === 'StringLiteral'))
            ) {
              getterIsSafe = true;
            }
          }
        }
      }
    }
  }

  if (hasValue) return false;
  if (hasGetter && (hasEnumerableFalse || !getterIsSafe)) return true;
  return false;
};

/**
 * @param {CallExpression} node
 * @returns {{ target: Expression, name: string, descriptor: ObjectExpression } | null}
 */
const matchDefineProperty = node => {
  if (
    !isMember(node.callee, 'Object', 'defineProperty') ||
    node.arguments.length < 3
  ) {
    return null;
  }
  const [target, nameArg, descriptor] = node.arguments;
  if (nameArg.type !== 'StringLiteral') return null;
  if (descriptor.type !== 'ObjectExpression') return null;
  const typedTarget = /** @type {Expression} */ (target);
  return { target: typedTarget, name: nameArg.value, descriptor };
};

/**
 * @param {Expression} test
 * @param {string} keyParam
 * @returns {boolean}
 */
const containsDefaultGuard = (test, keyParam) => {
  if (test.type === 'BinaryExpression') {
    if (
      test.operator === '===' &&
      test.left.type === 'Identifier' &&
      test.left.name === keyParam &&
      test.right.type === 'StringLiteral' &&
      test.right.value === 'default'
    ) {
      return true;
    }
  }
  if (test.type === 'LogicalExpression') {
    return (
      containsDefaultGuard(test.left, keyParam) ||
      containsDefaultGuard(test.right, keyParam)
    );
  }
  return false;
};

/**
 * Checks if an expression contains `keyParam !== "default"`.
 *
 * @param {import('@babel/types').Expression} test
 * @param {string} keyParam
 * @returns {boolean}
 */
const containsNegatedDefaultGuard = (test, keyParam) => {
  if (test.type === 'BinaryExpression') {
    if (
      test.operator === '!==' &&
      test.left.type === 'Identifier' &&
      test.left.name === keyParam &&
      test.right.type === 'StringLiteral' &&
      test.right.value === 'default'
    ) {
      return true;
    }
  }
  if (test.type === 'LogicalExpression') {
    return (
      containsNegatedDefaultGuard(test.left, keyParam) ||
      containsNegatedDefaultGuard(test.right, keyParam)
    );
  }
  return false;
};

/**
 * @param {import('@babel/types').CallExpression} node
 * @param {string} keyParam
 * @param {string} varName
 * @returns {boolean}
 */
const matchDefinePropertyDynamic = (node, keyParam, varName) => {
  if (
    !isMember(node.callee, 'Object', 'defineProperty') ||
    node.arguments.length < 3
  ) {
    return false;
  }
  const [target, keyArg, descriptor] = node.arguments;
  if (!isExportsIdentifier(target)) return false;
  if (keyArg.type !== 'Identifier' || keyArg.name !== keyParam) return false;
  if (descriptor.type !== 'ObjectExpression') return false;

  let hasEnumerableTrue = false;
  let hasValidGetter = false;

  for (const prop of descriptor.properties) {
    if (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') {
      const propName = getPropertyKeyName(prop.key, prop.computed);

      if (propName === 'enumerable') {
        if (
          prop.type === 'ObjectProperty' &&
          prop.value.type === 'BooleanLiteral' &&
          prop.value.value === true
        ) {
          hasEnumerableTrue = true;
        }
      }

      if (propName === 'get') {
        const body = extractGetterBody(prop);
        if (body && body.body.length === 1) {
          const stmt = body.body[0];
          if (
            stmt.type === 'ReturnStatement' &&
            stmt.argument &&
            isBracketAccess(stmt.argument, varName, keyParam)
          ) {
            hasValidGetter = true;
          }
        }
      }
    }
  }

  return hasEnumerableTrue && hasValidGetter;
};

/**
 * Detects the Babel-compiled star-reexport pattern.
 *
 * @param {CallExpression} node
 * @param {Record<string, string>} starExportMap
 * @returns {string | null}
 */
const matchBabelReexportPattern = (node, starExportMap) => {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.property.type !== 'Identifier' ||
    node.callee.property.name !== 'forEach'
  ) {
    return null;
  }

  const receiver = node.callee.object;
  if (
    receiver.type !== 'CallExpression' ||
    !isMember(receiver.callee, 'Object', 'keys') ||
    receiver.arguments.length !== 1 ||
    receiver.arguments[0].type !== 'Identifier'
  ) {
    return null;
  }

  const varName = receiver.arguments[0].name;

  if (
    node.arguments.length !== 1 ||
    (node.arguments[0].type !== 'FunctionExpression' &&
      node.arguments[0].type !== 'ArrowFunctionExpression')
  ) {
    return null;
  }

  const fn = node.arguments[0];
  if (fn.params.length !== 1 || fn.params[0].type !== 'Identifier') {
    return null;
  }
  const keyParam = fn.params[0].name;

  const body = fn.body.type === 'BlockStatement' ? fn.body.body : null;
  if (!body || body.length < 1) return null;

  const firstStmt = body[0];
  if (firstStmt.type !== 'IfStatement') return null;

  // Pattern A: if (key === "default" || ...) return; ... exports[key] = x[key]
  if (body.length >= 2 && containsDefaultGuard(firstStmt.test, keyParam)) {
    const exportStmt = body[body.length - 1];

    if (exportStmt.type === 'ExpressionStatement') {
      const expr = exportStmt.expression;

      if (
        expr.type === 'AssignmentExpression' &&
        expr.operator === '=' &&
        isExportsBracketAccess(expr.left, keyParam) &&
        isBracketAccess(expr.right, varName, keyParam)
      ) {
        return starExportMap[varName] || null;
      }

      if (expr.type === 'CallExpression') {
        if (matchDefinePropertyDynamic(expr, keyParam, varName)) {
          return starExportMap[varName] || null;
        }
      }
    }
    return null;
  }

  // Pattern B: if (k !== 'default') exports[k] = x[k]
  // or: if (k !== 'default' && ...) exports[k] = x[k]
  if (containsNegatedDefaultGuard(firstStmt.test, keyParam)) {
    const consequent =
      firstStmt.consequent.type === 'BlockStatement'
        ? firstStmt.consequent.body[0]
        : firstStmt.consequent;

    if (consequent && consequent.type === 'ExpressionStatement') {
      const expr = consequent.expression;

      if (
        expr.type === 'AssignmentExpression' &&
        expr.operator === '=' &&
        isExportsBracketAccess(expr.left, keyParam) &&
        isBracketAccess(expr.right, varName, keyParam)
      ) {
        return starExportMap[varName] || null;
      }

      if (expr.type === 'CallExpression') {
        if (matchDefinePropertyDynamic(expr, keyParam, varName)) {
          return starExportMap[varName] || null;
        }
      }
    }
  }

  return null;
};

/**
 * Extracts a callee name from a CallExpression, handling both bare identifiers
 * and member expressions (e.g. `tslib.__exportStar`).
 *
 * @param {CallExpression} node
 * @returns {string | null}
 */
const getCalleeName = node => {
  if (node.callee.type === 'Identifier') {
    return node.callee.name;
  }
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier'
  ) {
    return node.callee.property.name;
  }
  return null;
};

/**
 * Creates paired Babel plugins for CJS module analysis and transformation.
 *
 * @param {CjsTransformSourceParams} options
 * @returns {{ analyzePlugin: PluginFactory, transformPlugin: PluginFactory }}
 */
export default function makeCjsModulePlugins(options) {
  const {
    requires,
    exports: exportsSet,
    reexports,
    imports: importsArr,
    unsafeGetters,
    dynamicImport,
    starExportMap,
  } = options;

  /** @type {PluginFactory} */
  const analyzePlugin = () => ({
    visitor: {
      CallExpression(path) {
        const { node } = path;

        if (isRequireCall(node)) {
          const specifier = getStringCallArg(node);
          if (specifier !== null) {
            requires.push(specifier);
          }
          return;
        }

        if (node.callee.type === 'Import') {
          dynamicImport.present = true;
          const specifier = getStringCallArg(node);
          if (specifier !== null) {
            importsArr.push(specifier);
          }
          return;
        }

        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === '_interopRequireWildcard' &&
          node.arguments[0] &&
          node.arguments[0].type === 'CallExpression' &&
          isRequireCall(node.arguments[0])
        ) {
          const specifier = getStringCallArg(node.arguments[0]);
          if (specifier !== null) {
            requires.push(specifier);
          }
          return;
        }

        const calleeName = getCalleeName(node);

        if (
          (calleeName === '__export' || calleeName === '__exportStar') &&
          node.arguments[0] &&
          node.arguments[0].type === 'CallExpression' &&
          isRequireCall(node.arguments[0])
        ) {
          const specifier = getStringCallArg(node.arguments[0]);
          if (specifier !== null) {
            requires.push(specifier);
            reexports.add(specifier);
          }
          return;
        }

        const dp = matchDefineProperty(node);
        if (dp) {
          const { target, name, descriptor } = dp;
          if (isExportsIdentifier(target) || isModuleExports(target)) {
            if (isValidExportName(name)) {
              if (hasUnsafeGetter(descriptor)) {
                unsafeGetters.add(name);
              } else {
                exportsSet.add(name);
              }
            }
          }
          return;
        }

        const reexportSpecifier = matchBabelReexportPattern(
          node,
          starExportMap,
        );
        if (reexportSpecifier !== null) {
          reexports.add(reexportSpecifier);
        }
      },

      AssignmentExpression(path) {
        const { node } = path;
        const { left, right } = node;
        if (node.operator !== '=') return;

        if (
          left.type === 'MemberExpression' &&
          isExportsIdentifier(left.object)
        ) {
          const name = getMemberPropertyName(left);
          if (name !== null && isValidExportName(name)) {
            exportsSet.add(name);
          }
          return;
        }

        if (left.type === 'MemberExpression' && isModuleExports(left.object)) {
          const name = getMemberPropertyName(left);
          if (name !== null && isValidExportName(name)) {
            exportsSet.add(name);
          }
          return;
        }

        if (isModuleExports(left)) {
          if (right.type === 'CallExpression' && isRequireCall(right)) {
            const specifier = getStringCallArg(right);
            if (specifier !== null) {
              requires.push(specifier);
              reexports.clear();
              reexports.add(specifier);
            }
            return;
          }

          if (right.type === 'ObjectExpression') {
            collectObjectExports(right, exportsSet, reexports, requires);
            return;
          }

          exportsSet.add('default');
        }
      },

      ExpressionStatement(path) {
        const { node } = path;
        if (
          node.expression.type !== 'LogicalExpression' ||
          node.expression.operator !== '&&' ||
          node.expression.left.type !== 'NumericLiteral' ||
          node.expression.left.value !== 0
        ) {
          return;
        }

        const rhs = node.expression.right;
        /** @type {Expression[]} */
        const parts = [];
        /** @param {Expression} expr */
        const collectParts = expr => {
          if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
            collectParts(expr.left);
            collectParts(expr.right);
          } else {
            parts.push(expr);
          }
        };
        collectParts(rhs);

        for (const part of parts) {
          if (
            part.type === 'AssignmentExpression' &&
            part.operator === '=' &&
            isModuleExports(part.left) &&
            part.right.type === 'ObjectExpression'
          ) {
            for (const prop of part.right.properties) {
              if (
                prop.type === 'ObjectProperty' ||
                prop.type === 'ObjectMethod'
              ) {
                const name = getPropertyKeyName(prop.key, prop.computed);
                if (name !== null && isValidExportName(name)) {
                  exportsSet.add(name);
                }
              }
            }
          }
          if (part.type === 'CallExpression') {
            const cn = getCalleeName(part);
            if (
              (cn === '__export' || cn === '__exportStar') &&
              part.arguments.length >= 1 &&
              part.arguments[0].type === 'CallExpression' &&
              isRequireCall(part.arguments[0])
            ) {
              const specifier = getStringCallArg(part.arguments[0]);
              if (specifier !== null) {
                requires.push(specifier);
                reexports.add(specifier);
              }
            }
          }
        }
      },

      VariableDeclarator(path) {
        const { node } = path;
        if (node.id.type !== 'Identifier' || !node.init) {
          return;
        }
        // Only track top-level declarations for star-export backtracking.
        // Block-scoped declarations (inside { }, if, etc.) are not reexport
        // candidates.
        const declParent = path.parentPath?.parentPath;
        if (!declParent || declParent.node.type !== 'Program') {
          return;
        }

        let specifier = null;

        if (node.init.type === 'CallExpression' && isRequireCall(node.init)) {
          specifier = getStringCallArg(node.init);
        } else if (
          node.init.type === 'CallExpression' &&
          node.init.callee.type === 'Identifier' &&
          node.init.callee.name === '_interopRequireWildcard' &&
          node.init.arguments[0] &&
          node.init.arguments[0].type === 'CallExpression' &&
          isRequireCall(node.init.arguments[0])
        ) {
          specifier = getStringCallArg(node.init.arguments[0]);
        }

        if (specifier !== null) {
          starExportMap[node.id.name] = specifier;
        }
      },
    },
  });

  /** @type {PluginFactory} */
  const transformPlugin = ({ types: t }) => {
    /** @type {WeakSet<Identifier>} */
    const allowedHiddens = new WeakSet();

    /** @param {string} hi */
    const hiddenIdentifier = hi => {
      const ident = t.identifier(hi);
      allowedHiddens.add(ident);
      return ident;
    };

    return {
      visitor: {
        Identifier(path) {
          if (options.allowHidden || allowedHiddens.has(path.node)) {
            return;
          }
          const i = h.HIDDEN_IDENTIFIERS.indexOf(path.node.name);
          if (i >= 0) {
            throw path.buildCodeFrameError(
              `The ${h.HIDDEN_IDENTIFIERS[i]} identifier is reserved`,
            );
          }
          if (path.node.name.startsWith(h.HIDDEN_CONST_VAR_PREFIX)) {
            throw path.buildCodeFrameError(
              `The ${path.node.name} constant variable is reserved`,
            );
          }
        },
        CallExpression(path) {
          if (path.node.callee.type === 'Import') {
            path.node.callee = hiddenIdentifier(h.HIDDEN_IMPORT);
          }
        },
      },
    };
  };

  return { analyzePlugin, transformPlugin };
}
