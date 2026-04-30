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

import * as t from '@babel/types';
import * as h from './hidden.js';

/**
 * @import {CjsTransformSourceParams} from './types/cjs-module-source.js'
 * @import {VisitorPlugin} from './types/analyzer.js'
 * @import {Node,
 *  CallExpression,
 *  UnaryExpression,
 *  Expression,
 *  PrivateName,
 *  MemberExpression,
 *  ObjectProperty,
 *  ObjectMethod,
 *  BlockStatement,
 *  ObjectExpression,
 *  Identifier,
 *  AssignmentExpression,
 *  ExpressionStatement,
 *  VariableDeclarator,
 * } from '@babel/types'
 * @import {Visitor, NodePath} from '@babel/traverse'
 */

const { freeze } = Object;

/**
 * Reserved keywords disallowed as named export names.
 */
const strictReserved = freeze(
  new Set([
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
  ]),
);

/**
 * Subset of {@link UnaryExpression} operators that look like valid identifiers.
 */
const unaryExpressionWordOperators = freeze(
  new Set(['delete', 'typeof', 'void', 'throw']),
);

/**
 * Determines whether a detected name may be recorded as a named export.
 *
 * Node.js and the upstream `cjs-module-lexer` emit non-identifier export names
 * verbatim: only an ES module *binding* (local) name must be a valid
 * identifier, whereas the exported *name* can be an arbitrary string (e.g. via
 * `export { local as 'weird name' }`). We therefore reject only strict-reserved
 * words, deliberately diverging from `@endo/cjs-module-analyzer`, which
 * over-filters non-identifier names for reasons lost to history.
 *
 * @param {string} name
 * @returns {boolean}
 */
const isValidExportName = name => !strictReserved.has(name);

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
 * Used by `matchDefinePropertyDynamic` for the dynamic-key forEach pattern.
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
 * Extracts the BlockStatement body from a getter that uses only a regular
 * `function` expression or method shorthand (NOT arrow functions). The
 * character-level reference lexer specifically requires the `function` keyword
 * for `Object.defineProperty` getters; arrow functions are rejected as unsafe.
 *
 * @param {ObjectProperty | ObjectMethod} prop
 * @returns {BlockStatement | null}
 */
const extractFunctionGetterBody = prop => {
  if (prop.type === 'ObjectMethod') {
    return prop.body;
  }
  if (
    prop.type === 'ObjectProperty' &&
    prop.value.type === 'FunctionExpression' &&
    prop.value.body.type === 'BlockStatement'
  ) {
    return prop.value.body;
  }
  return null;
};

/**
 * Determines whether an object-literal property value *begins* with an
 * identifier token, mirroring the lexer's `identifier()` probe on the value.
 *
 * The lexer records the property key only when this probe succeeds. Because
 * `identifier()` is purely lexical (an `ID_Start` char followed by an
 * `ID_Continue` run), it also succeeds for keyword-headed expressions such as
 * `true`/`false`/`null`, `function …`, `class …`, `new …`, and word operators
 * (`typeof`/`void`/`delete`; see {@link unaryExpressionWordOperators}
 * above). It fails for numeric/string/object/array/arrow literals, template
 * strings, and symbol-operator expressions (`-1`, `!x`, …).
 *
 * @param {Node} node
 * @returns {boolean}
 */
const valueStartsWithIdentifier = node => {
  switch (node.type) {
    case 'Identifier':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'FunctionExpression':
    case 'ClassExpression':
    case 'NewExpression':
      return true;
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return valueStartsWithIdentifier(node.object);
    case 'CallExpression':
    case 'OptionalCallExpression':
      return valueStartsWithIdentifier(node.callee);
    case 'TaggedTemplateExpression':
      return valueStartsWithIdentifier(node.tag);
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'AssignmentExpression':
      return valueStartsWithIdentifier(node.left);
    case 'ConditionalExpression':
      return valueStartsWithIdentifier(node.test);
    case 'SequenceExpression':
      return valueStartsWithIdentifier(node.expressions[0]);
    case 'UnaryExpression':
      return unaryExpressionWordOperators.has(node.operator);
    default:
      return false;
  }
};

/**
 * Determines whether an object-literal property value is a *bare* identifier
 * run — a lone identifier or one of the keyword literals `true`/`false`/`null`.
 *
 * The lexer continues to the next property only in this case; any trailing
 * member access, call, or operator records the key but then stops, because the
 * character after the leading identifier is neither `,` nor `}`.
 *
 * @param {Expression} node
 * @returns {boolean}
 */
const isBareIdentifierRun = node =>
  node.type === 'Identifier' ||
  node.type === 'BooleanLiteral' ||
  node.type === 'NullLiteral';

/**
 * Collects named exports and reexports from an object literal, replicating the
 * ordered, stop-at-first-hard-property semantics of the character-level lexer.
 *
 * Rules (matching `@endo/cjs-module-analyzer` behaviour):
 * - Shorthand `{name}` → add `name`, continue.
 * - `key: identifier` (or `true`/`false`/`null`) → add `key`, continue.
 * - `key: value` where `value` *begins* with an identifier but is not a bare
 *   identifier run (`key: obj.prop`, `key: fn()`, `key: require(x)`,
 *   `key: function () {}`, …) → add `key`, then STOP.
 * - `key: value` where `value` does not begin with an identifier (numeric,
 *   string, object, array, arrow, template, `-1`, …) → STOP without adding
 *   `key`. The lexer bails *before* recording the key in this case.
 * - `...require(specifier)` → add `specifier` to reexports, continue (spreads
 *   never stop parsing).
 * - `...nonRequireExpr` → skip, continue.
 * - `ObjectMethod` (getter/setter/method) → STOP (the character-level lexer
 *   does not recognise getter syntax inside object literals).
 *
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
      // Spread elements (require or otherwise) never stop parsing.
    } else if (prop.type === 'ObjectProperty') {
      // The lexer records `key` only when the value begins with an identifier
      // token. A value that does not (numeric/string/object/array/arrow
      // literal, …) makes the lexer bail *before* recording the key, so we
      // must STOP without adding it. (Shorthand values are always the key
      // identifier itself.)
      const value = /** @type {Expression} */ (prop.value);
      if (!prop.shorthand && !valueStartsWithIdentifier(value)) {
        break;
      }
      const name = getPropertyKeyName(prop.key, prop.computed);
      if (name !== null && isValidExportName(name)) {
        exportsSet.add(name);
      }
      // Parsing continues only for a bare identifier run (or shorthand); any
      // trailing member/call/operator (`key: obj.prop`, `key: require(x)`,
      // `key: fn()`, …) records the key but then STOPS.
      if (!prop.shorthand && !isBareIdentifierRun(value)) {
        break;
      }
    } else if (prop.type === 'ObjectMethod') {
      // Getter / setter / method shorthand in an object literal. The
      // character-level lexer does not parse getter syntax here, so we stop.
      break;
    }
  }
};

/**
 * Returns `true` when the `Object.defineProperty` descriptor should cause the
 * export name to land in `unsafeGetters` (and therefore be filtered from the
 * final `exports` array).
 *
 * The rules replicate the character-level reference lexer
 * (`@endo/cjs-module-analyzer`) exactly. The descriptor must begin with one of
 * these two openings; anything else is treated as unsafe:
 *
 * 1. `{ enumerable: true, value: … }` – first key is `enumerable: true,`,
 *    second is `value:` → safe (export the name).
 * 2. `{ value: … }` – first key is `value:` (no `enumerable`) → safe.
 * 3. `{ enumerable: true, get: function … }` – optionally preceded by
 *    `enumerable: true,` → safe if the getter body is valid (see below).
 * 4. `{ get: function … }` – no `enumerable` → safe if getter body is valid.
 *
 * Any descriptor that starts with `enumerable: false`, `configurable:`, or any
 * other key is treated as unsafe regardless of what follows.
 *
 * A getter body is safe when it is a regular `function` (not an arrow
 * function), takes no parameters, and returns exactly one expression that is
 * one of:
 * - a bare `Identifier` (`return x;`)
 * - `Identifier.Identifier` (`return x.y;`)
 * - `Identifier['StringLiteral']` (`return x['y'];`)
 *
 * @param {ObjectExpression} descriptorNode
 * @returns {boolean}
 */
const hasUnsafeGetter = descriptorNode => {
  const props = descriptorNode.properties.filter(
    p => p.type === 'ObjectProperty' || p.type === 'ObjectMethod',
  );

  let nextIdx = 0;

  // Optionally accept `enumerable: true,` as the very first descriptor key.
  if (props.length > 0) {
    const first = props[0];
    const firstKey = getPropertyKeyName(first.key, first.computed);
    if (firstKey === 'enumerable') {
      if (
        first.type === 'ObjectProperty' &&
        first.value.type === 'BooleanLiteral' &&
        first.value.value === true
      ) {
        // `enumerable: true` → accepted, advance to the next property.
        nextIdx = 1;
      } else {
        // `enumerable: false` (or any non-literal / non-true value) → unsafe.
        return true;
      }
    }
  }

  const keyProp = props[nextIdx];
  if (!keyProp) return true; // no meaningful key after optional enumerable → unsafe

  const keyName = getPropertyKeyName(keyProp.key, keyProp.computed);

  if (keyName === 'value') {
    // Descriptor has a `value:` key in the right position → safe.
    return false;
  }

  if (keyName === 'get') {
    // Descriptor is a getter. Accept only regular `function` getters (not
    // arrows); the reference lexer requires the `function` keyword.
    const body = extractFunctionGetterBody(keyProp);
    if (!body || body.body.length !== 1) return true;

    const stmt = body.body[0];
    if (stmt.type !== 'ReturnStatement' || !stmt.argument) return true;

    const ret = stmt.argument;

    // Bare identifier: `return x;`
    if (ret.type === 'Identifier') return false;

    // Member expression: `return x.y;` or `return x['y'];`
    if (ret.type === 'MemberExpression' && ret.object.type === 'Identifier') {
      if (!ret.computed && ret.property.type === 'Identifier') return false;
      if (ret.computed && ret.property.type === 'StringLiteral') return false;
    }

    return true; // any other return value → unsafe
  }

  // First meaningful descriptor key is neither 'value' nor 'get' → unsafe.
  return true;
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
 * @param {CallExpression} node
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
 * Detects reexports in the `forEach` pattern.
 *
 * @param {CallExpression} node
 * @param {Record<string, string>} starExportMap
 * @returns {string | null}
 */
const matchForEachReexportPattern = (node, starExportMap) => {
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

  // Pattern B: `if (k !== 'default') exports[k] = x[k]`
  // Optionally followed by one of two allowed `&&` guards (matching the
  // character-level lexer exactly):
  //   `&& !id.hasOwnProperty(k)`              (id = the iterated variable)
  //   `&& !Object[.prototype].hasOwnProperty.call(any, k)`
  //
  // Any other `&&` clause (e.g. `!a().hasOwnProperty(k)` or
  // `!exports.hasOwnProperty(k)`) must NOT match — the reference lexer
  // rejects them.
  const isExactNegatedDefault =
    firstStmt.test.type === 'BinaryExpression' &&
    firstStmt.test.operator === '!==' &&
    firstStmt.test.left.type === 'Identifier' &&
    firstStmt.test.left.name === keyParam &&
    firstStmt.test.right.type === 'StringLiteral' &&
    firstStmt.test.right.value === 'default';

  const isNegatedDefaultWithGuard = (() => {
    if (
      firstStmt.test.type !== 'LogicalExpression' ||
      firstStmt.test.operator !== '&&'
    )
      return false;
    const { left, right } = firstStmt.test;
    if (
      left.type !== 'BinaryExpression' ||
      left.operator !== '!==' ||
      left.left.type !== 'Identifier' ||
      left.left.name !== keyParam ||
      left.right.type !== 'StringLiteral' ||
      left.right.value !== 'default'
    )
      return false;
    // The right side of `&&` must be `!<allowed-hasOwnProperty>`.
    if (right.type !== 'UnaryExpression' || right.operator !== '!')
      return false;
    const call = right.argument;
    if (call.type !== 'CallExpression') return false;
    const { callee } = call;

    // Form 1: `!varName.hasOwnProperty(k)` — the object being tested must be
    // the SAME identifier as the one passed to `Object.keys()`. The reference
    // character-level lexer explicitly checks `source.startsWith(id, pos)`
    // where `id` is the iterated variable, so `!exports.hasOwnProperty(k)` is
    // rejected when the iterated variable is e.g. `external6`.
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'hasOwnProperty' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === varName &&
      call.arguments.length === 1 &&
      call.arguments[0].type === 'Identifier' &&
      call.arguments[0].name === keyParam
    ) {
      return true;
    }

    // Form 2: `!Object.hasOwnProperty.call(X, k)` or
    //          `!Object.prototype.hasOwnProperty.call(X, k)`
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'call' &&
      call.arguments.length === 2 &&
      call.arguments[1].type === 'Identifier' &&
      call.arguments[1].name === keyParam
    ) {
      const hop = callee.object;
      if (
        hop.type === 'MemberExpression' &&
        !hop.computed &&
        hop.property.type === 'Identifier' &&
        hop.property.name === 'hasOwnProperty' &&
        hop.object.type === 'Identifier' &&
        hop.object.name === 'Object'
      )
        return true;
      if (
        hop.type === 'MemberExpression' &&
        !hop.computed &&
        hop.property.type === 'Identifier' &&
        hop.property.name === 'hasOwnProperty' &&
        hop.object.type === 'MemberExpression' &&
        !hop.object.computed &&
        hop.object.property.type === 'Identifier' &&
        hop.object.property.name === 'prototype' &&
        hop.object.object.type === 'Identifier' &&
        hop.object.object.name === 'Object'
      )
        return true;
    }

    return false;
  })();

  if (isExactNegatedDefault || isNegatedDefaultWithGuard) {
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
 * Creates paired analyze and transform visitor passes for CJS module source code.
 *
 * @param {CjsTransformSourceParams} options
 * @returns {{ analyzePlugin: VisitorPlugin, transformPlugin: VisitorPlugin }}
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

  const analyzePlugin = {
    /** @type {Visitor} */
    visitor: {
      /**
       * Detects the five call-expression shapes that carry CJS import/export
       * information:
       *
       * 1. `require('specifier')` → records an import specifier.
       * 2. `import('specifier')` → flags dynamic `import()` and records the
       *    specifier (any arg count is accepted, unlike `require`).
       * 3. `__export(require('x'))` / `tslib.__exportStar(require('x'))` — the
       *    Babel/TypeScript star-reexport helpers → records both a require and
       *    a reexport.
       * 4. `Object.defineProperty(exports, 'name', descriptor)` (or on
       *    `module.exports`) → records a named export, or files it under
       *    `unsafeGetters` when the descriptor's getter is not lexer-safe.
       * 5. `Object.keys(x).forEach(k => { ... })` copy loops → records a star
       *    reexport (see {@link matchForEachReexportPattern}).
       *
       * @param {NodePath<CallExpression>} path
       */
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
          // Use the first arg directly — import attributes are the second arg
          // and do not affect which module is loaded, so we accept any arg
          // count here (unlike require(), which must have exactly one arg).
          const firstArg = node.arguments[0];
          const specifier =
            firstArg && firstArg.type === 'StringLiteral'
              ? firstArg.value
              : null;
          if (specifier !== null) {
            importsArr.push(specifier);
          }
          return;
        }

        const calleeName = getCalleeName(node);

        // the lexer _also_ hardcodes these names.
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

        const reexportSpecifier = matchForEachReexportPattern(
          node,
          starExportMap,
        );
        if (reexportSpecifier !== null) {
          reexports.add(reexportSpecifier);
        }
      },

      /**
       * Detects `=` assignments that define exports:
       *
       * - `exports.name = value` → records the named export `name`.
       * - `module.exports.name = value` → records the named export `name`.
       * - `module.exports = require('x')` → a whole-module reexport; clears any
       *   previously-detected reexports and records `x`.
       * - `module.exports = { ... }` → collects named exports and spread
       *   reexports from the object literal (see {@link collectObjectExports}),
       *   after clearing prior reexports.
       * - `module.exports = <anything else>` (a function, class, literal, …) →
       *   records a single `default` export and clears prior reexports.
       *
       * Only `=` is handled; compound assignments (`+=`, `??=`, …) are ignored.
       *
       * @param {NodePath<AssignmentExpression>} path
       */
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
            // Reassigning module.exports discards any previously-detected
            // re-exports (e.g. an earlier `module.exports = require('x')`),
            // matching the character-level lexer and Node's runtime behavior.
            // This visitor also fires on the nested `module.exports = { ... }`
            // inside an esbuild `0 && (...)` hint, so that case is covered too.
            reexports.clear();
            collectObjectExports(right, exportsSet, reexports, requires);
            return;
          }

          reexports.clear();
          exportsSet.add('default');
        }
      },

      /**
       * Detects esbuild's dead-code "live binding" hint, a top-level statement
       * of the form:
       *
       * ```js
       * 0 && (module.exports = { foo, bar }, __export(require('x')));
       * ```
       *
       * The `0 &&` guard means the expression never executes at runtime, but
       * esbuild emits it so static tooling can discover the module's exports.
       * We flatten the `&&`-joined comma sequence and pick up the
       * `__export`/`__exportStar` reexport calls here; the nested
       * `module.exports = { ... }` assignment is handled separately by the
       * `AssignmentExpression` visitor.
       *
       * @param {NodePath<ExpressionStatement>} path
       */
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
          // The `module.exports = { ... }` assignment inside the hint is
          // handled by the `AssignmentExpression` visitor (which calls
          // `collectObjectExports` with proper stop-at-hard-property semantics).
          // We only need to pick up `__export`/`__exportStar` calls here,
          // since those are also covered by the `CallExpression` visitor when
          // it visits the nested call expression.
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

      /**
       * Records the require specifier behind a top-level local variable so the
       * `forEach` reexport detector can backtrack from the iterated variable to
       * its source module. Two initializer shapes are tracked:
       *
       * ```js
       * var x = require('specifier');
       * var x = _interopRequireWildcard(require('specifier'));
       * ```
       *
       * The resulting `starExportMap[x] = 'specifier'` lets
       * `Object.keys(x).forEach(...)` copy loops (see
       * {@link matchForEachReexportPattern}) resolve which module is being
       * re-exported. Only `Program`-scoped declarations qualify; block-scoped
       * declarations (inside `{ }`, `if`, functions, …) are never star-reexport
       * candidates.
       *
       * Note that `interopRequireWildcard` is also hardcoded by the lexer to
       * assist in detecting reexports.
       *
       * @param {NodePath<VariableDeclarator>} path
       */
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
  };

  /** @type {WeakSet<Identifier>} */
  const allowedHiddens = new WeakSet();

  /** @param {string} hi */
  const hiddenIdentifier = hi => {
    const ident = t.identifier(hi);
    allowedHiddens.add(ident);
    return ident;
  };

  const transformPlugin = {
    /** @type {Visitor} */
    visitor: {
      /**
       * Guards the reserved namespace the functor uses for its own machinery.
       * Throws a code-frame error if the source references any hidden runtime
       * identifier (e.g. `$h_import`, the members of
       * {@link h.HIDDEN_IDENTIFIERS}) or a name beginning with the reserved
       * const-var prefix ({@link h.HIDDEN_CONST_VAR_PREFIX}), so user code can
       * never collide with or spoof those internals. Identifiers we inject
       * ourselves are whitelisted via `allowedHiddens`, and the whole check is
       * skipped when `options.allowHidden` is set.
       *
       * @param {NodePath<Identifier>} path
       */
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
      /**
       * Rewrites dynamic `import(...)` calls so SES cannot censor them. The
       * `Import` callee (the `import` keyword in `import('x')`) is replaced with
       * a plain call to the hidden identifier {@link h.HIDDEN_IMPORT}:
       *
       * ```js
       * import('x')  →  $h͏_import('x')
       * ```
       *
       * The hidden name uses a prefix that embeds an invisible U+034F combining
       * grapheme joiner, so user code cannot spell (and therefore cannot spoof)
       * it. The functor later binds that identifier to the compartment's own
       * dynamic-import implementation, preserving `import()` semantics without
       * tripping SES's evaluator restrictions.
       *
       * @param {NodePath<CallExpression>} path
       */
      CallExpression(path) {
        if (path.node.callee.type === 'Import') {
          path.node.callee = hiddenIdentifier(h.HIDDEN_IMPORT);
        }
      },
    },
  };

  return { analyzePlugin, transformPlugin };
}
