// @ts-check
/* global harden */

import { makeExo } from '@endo/exo';

import { FaeToolInterface } from '../src/fae-tool-interface.js';

/**
 * Example tool caplet: safe arithmetic.
 * Run via `endo run --UNCONFINED tools/math.js` to produce a FaeTool exo.
 */
export const make = _powers => {
  /** @type {import('../src/tool-makers.js').ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'math',
      description:
        'Perform basic arithmetic: add, subtract, multiply, divide, modulo, or power.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description:
              'The operation: add, subtract, multiply, divide, modulo, power.',
          },
          a: { type: 'number', description: 'First operand.' },
          b: { type: 'number', description: 'Second operand.' },
        },
        required: ['operation', 'a', 'b'],
      },
    },
  });

  const ops = harden({
    /** @param {number} a @param {number} b */
    add: (a, b) => a + b,
    /** @param {number} a @param {number} b */
    subtract: (a, b) => a - b,
    /** @param {number} a @param {number} b */
    multiply: (a, b) => a * b,
    /** @param {number} a @param {number} b */
    divide: (a, b) => {
      if (b === 0) {
        throw new Error('Division by zero');
      }
      return a / b;
    },
    /** @param {number} a @param {number} b */
    modulo: (a, b) => {
      if (b === 0) {
        throw new Error('Modulo by zero');
      }
      return a % b;
    },
    /** @param {number} a @param {number} b */
    power: (a, b) => a ** b,
  });

  return makeExo('MathTool', FaeToolInterface, {
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { operation, a, b } =
        /** @type {{ operation: string, a: number, b: number }} */ (args);
      if (!operation || a === undefined || b === undefined) {
        throw new Error('operation, a, and b are required');
      }
      const fn = ops[/** @type {keyof typeof ops} */ (operation)];
      if (!fn) {
        throw new Error(
          `Unknown operation: ${operation}. Use: add, subtract, multiply, divide, modulo, power.`,
        );
      }
      const result = fn(a, b);
      return String(result);
    },
    help() {
      return 'Perform basic arithmetic operations.';
    },
  });
};
harden(make);
