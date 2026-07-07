import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tsParser from '@typescript-eslint/parser';
import rule from '../src/rules/restrict-comparison-operands.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

// This rule requires TypeScript type information via parserServices.
// We use the TypeScript-ESLint parser and a minimal project service config.
const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts'],
        defaultProject: 'tsconfig.json',
      },
      tsconfigRootDir: new URL('..', import.meta.url).pathname,
    },
  },
});

tester.run('restrict-comparison-operands', rule, {
  valid: [
    { code: 'declare const a: number, b: number; a < b;' },
    { code: 'declare const a: string, b: string; a < b;' },
    { code: 'declare const a: bigint, b: bigint; a < b;' },
    // Mixed numerics (number and bigint) are permitted.
    { code: 'declare const a: number, b: bigint; a < b;' },
    // allowUnknown: true suppresses the unknown-type report.
    {
      code: 'declare const a: any, b: number; a < b;',
      options: [{ allowUnknown: true }],
    },
  ],
  invalid: [
    {
      code: 'declare const a: number, b: string; a < b;',
      errors: [{ messageId: 'mismatch' }],
    },
    {
      code: 'declare const a: string, b: number; a > b;',
      errors: [{ messageId: 'mismatch' }],
    },
    {
      code: 'declare const a: any, b: number; a < b;',
      errors: [{ messageId: 'unknownType' }],
    },
    {
      // `object` type is non-comparable.
      code: 'declare const a: object, b: number; a < b;',
      errors: [{ messageId: 'invalidType' }],
    },
    {
      // boolean is non-comparable.
      code: 'declare const a: boolean, b: number; a > b;',
      errors: [{ messageId: 'invalidType' }],
    },
  ],
});
