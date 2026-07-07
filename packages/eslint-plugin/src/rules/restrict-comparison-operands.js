/* eslint-disable no-bitwise */
// @ts-nocheck
import ts from 'typescript';
import { createRule } from '../create-rule.js';

const COMPARABLE_TYPES = ['number', 'bigint', 'string', 'any'];

const NONCOMPARABLE = Symbol('non-comparable type');
const NO_NODE_MAP = Symbol('unknown');

export default createRule({
  name: 'restrict-comparison-operands',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require both operands of a comparison operator (`<`, `>`, `<=`, `>=`) to be compatible types — both primitive strings or both primitive numerics (`number` or `bigint`).',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowUnknown: {
            type: 'boolean',
            description:
              'Allow comparisons where one or both operands are of type `any` or `unknown`.',
          },
        },
      },
    ],
    messages: {
      mismatch: 'Comparison of mismatched types',
      invalidType: 'Comparison of invalid type(s)',
      unknownType: 'Comparison against unknown type',
    },
    defaultOptions: [{ allowUnknown: false }],
  },
  defaultOptions: [{ allowUnknown: false }],
  create(context, [{ allowUnknown }]) {
    const { parserServices } = context.sourceCode;
    const typeChecker = parserServices?.program?.getTypeChecker();

    if (!typeChecker) {
      return {};
    }

    const services = parserServices;

    const comparableTypeOf = type => {
      if (type.flags & ts.TypeFlags.EnumLike) {
        return NONCOMPARABLE;
      }
      if (type.isUnion()) {
        const subTypes = type.types.map(sub => comparableTypeOf(sub));
        return new Set(subTypes).size === 1 ? subTypes[0] : NONCOMPARABLE;
      }
      if (type.isIntersection()) {
        const subTypeSet = new Set(
          type.types.map(sub => comparableTypeOf(sub)),
        );
        for (const base of COMPARABLE_TYPES) {
          if (subTypeSet.has(base)) return base;
        }
        return NONCOMPARABLE;
      }
      if (type.flags & ts.TypeFlags.NumberLike) return 'number';
      if (type.flags & ts.TypeFlags.StringLike) return 'string';
      if (type.flags & ts.TypeFlags.BigIntLike) return 'bigint';

      const typeName = typeChecker.typeToString(type);
      if (COMPARABLE_TYPES.includes(typeName)) {
        return typeName;
      }
      return NONCOMPARABLE;
    };

    const getBaseConstraintOrType = type =>
      typeChecker.getBaseConstraintOfType(type) ?? type;

    const nodeMap = services.esTreeNodeToTSNodeMap;

    const comparableTypeOfASTNode = node => {
      let typedNode = nodeMap.get(node);
      if (!typedNode) return NO_NODE_MAP;

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
      return comparableTypeOf(getBaseConstraintOrType(fullType));
    };

    const operators = ['<', '>', '<=', '>='];
    const astSelector = `BinaryExpression:matches(${operators
      .map(op => `[operator='${op}']`)
      .join(', ')})`;

    return {
      [astSelector](node) {
        const binNode = node;
        const leftType = comparableTypeOfASTNode(binNode.left);
        const rightType = comparableTypeOfASTNode(binNode.right);

        if (leftType === NO_NODE_MAP || rightType === NO_NODE_MAP) return;

        if (leftType === NONCOMPARABLE || rightType === NONCOMPARABLE) {
          context.report({ node, messageId: 'invalidType' });
          return;
        }
        if (leftType === 'any' || rightType === 'any') {
          if (!allowUnknown) {
            context.report({ node, messageId: 'unknownType' });
          }
          return;
        }
        if (leftType === rightType) return;

        const mixedNumerics =
          (leftType === 'number' && rightType === 'bigint') ||
          (leftType === 'bigint' && rightType === 'number');
        if (mixedNumerics) return;

        context.report({ node, messageId: 'mismatch' });
      },
    };
  },
});
