/* eslint-env node */
/* eslint no-bitwise: ["off"] */

'use strict';

const ts = require('typescript');
const { ESLintUtils } = require('@typescript-eslint/utils');

const COMPARABLE_TYPES = ['number', 'bigint', 'string', 'any'];
const NONCOMPARABLE = Symbol('non-comparable type');
const NO_NODE_MAP = Symbol('unknown');

const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/endojs/endo/blob/master/packages/eslint-plugin/lib/rules/${name}.js`,
);

module.exports = createRule({
  name: 'restrict-comparison-operands',
  meta: {
    docs: {
      description:
        'require both operands of a comparison operator (`<`, `>`, `<=`, `>=`) to be compatible types, either both primitive strings or both primitive numerics (number or bigint)',
    },
    type: 'problem',
    messages: {
      mismatch: 'Comparison of mismatched types',
      invalidType: 'Comparison of invalid type(s)',
      unknownType: 'Comparison against unknown type',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowUnknown: { type: 'boolean' },
          // TODO: `allowMixedNumerics: { type: "boolean" }`?
        },
      },
    ],
  },
  defaultOptions: [
    {
      allowUnknown: false,
    },
  ],
  create(context, [{ allowUnknown }]) {
    // Loosely follows
    // https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/src/rules/restrict-plus-operands.ts

    const { parserServices } = context.sourceCode;
    const typeChecker = parserServices?.program?.getTypeChecker();

    if (!typeChecker) {
      // broken parserservices
      return {};
    }

    const comparableTypeOf = type => {
      if (type.flags & ts.TypeFlags.EnumLike) {
        // Enum values are never comparable.
        return NONCOMPARABLE;
      } else if (type.isUnion()) {
        // Union types are comparable iff all subtypes map to the same comparable type.
        const subTypes = type.types.map(subType => comparableTypeOf(subType));
        return new Set(subTypes).size === 1 ? subTypes[0] : NONCOMPARABLE;
      } else if (type.isIntersection()) {
        const subTypes = new Set(
          type.types.map(subType => comparableTypeOf(subType)),
        );
        // Intersection types compare by most specific subtype
        // (but since e.g. `number & string` is meaningless,
        // all subtypes except `any` are equally specific).
        for (const baseType of COMPARABLE_TYPES) {
          if (subTypes.has(baseType)) {
            return baseType;
          }
        }
        return NONCOMPARABLE;
      } else if (type.flags & ts.TypeFlags.NumberLike) {
        return 'number';
      } else if (type.flags & ts.TypeFlags.StringLike) {
        return 'string';
      } else if (type.flags & ts.TypeFlags.BigIntLike) {
        return 'bigint';
      }

      // If simple type analysis was not possible, use the generic TS facility.
      const typeName = typeChecker.typeToString(type);
      if (COMPARABLE_TYPES.includes(typeName)) {
        return typeName;
      }
      return NONCOMPARABLE;
    };
    const getBaseConstraintOrType = type => {
      const baseConstraint = typeChecker.getBaseConstraintOfType(type);
      return baseConstraint ?? type;
    };
    const comparableTypeOfASTNode = node => {
      let typedNode = parserServices?.esTreeNodeToTSNodeMap?.get(node);
      if (!typedNode) {
        return NO_NODE_MAP;
      }
      for (
        let wrapper = typedNode.parent;
        wrapper && ts.isParenthesizedExpression(wrapper);
        wrapper = wrapper.parent
      ) {
        if (ts.getJSDocType(wrapper)) {
          typedNode = wrapper;
        }
      }
      const fullType = typeChecker.getTypeAtLocation(typedNode);
      const resolvedType = getBaseConstraintOrType(fullType);
      const comparableType = comparableTypeOf(resolvedType);
      return comparableType;
    };

    const checkComparisonOperands = node => {
      const leftType = comparableTypeOfASTNode(node.left);
      const rightType = comparableTypeOfASTNode(node.right);

      if (leftType === NO_NODE_MAP || rightType === NO_NODE_MAP) {
        // broken parserServices
        return;
      }

      if (leftType === NONCOMPARABLE || rightType === NONCOMPARABLE) {
        context.report({ node, messageId: 'invalidType' });
      }
      if (leftType === 'any' || rightType === 'any') {
        if (!allowUnknown) {
          context.report({ node, messageId: 'unknownType' });
        }
        return;
      }

      if (leftType === rightType) {
        return;
      }
      const mixedNumerics =
        (leftType === 'number' && rightType === 'bigint') ||
        (leftType === 'bigint' && rightType === 'number');
      if (mixedNumerics) {
        return;
      }
      context.report({ node, messageId: 'mismatch' });
    };

    const operators = ['<', '>', '<=', '>='];
    const astSelector = `BinaryExpression:matches(${operators
      .map(op => `[operator='${op}']`)
      .join(', ')})`;
    return { [astSelector]: checkComparisonOperands };
  },
});
