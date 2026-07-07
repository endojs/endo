import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-polymorphic-call.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-polymorphic-call', rule, {
  valid: [
    // Plain function calls (not method calls) are fine.
    { code: 'foo();' },
    { code: 'foo(a, b);' },
    { code: 'new Foo();' },
  ],
  invalid: [
    {
      code: 'array.slice();',
      errors: [
        {
          messageId: 'polymorphicCall',
          data: { hint: 'array.slice' },
        },
      ],
    },
    {
      code: 'obj.method();',
      errors: [
        {
          messageId: 'polymorphicCall',
          data: { hint: 'obj.method' },
        },
      ],
    },
    {
      code: 'a.b.c();',
      errors: [
        {
          messageId: 'polymorphicCall',
          data: { hint: 'a.b.c' },
        },
      ],
    },
    {
      code: 'obj[key]();',
      errors: [
        {
          messageId: 'polymorphicCall',
          data: { hint: 'obj.[key]' },
        },
      ],
    },
    {
      code: '[1, 2].map(x => x);',
      errors: [
        {
          messageId: 'polymorphicCall',
          data: { hint: '[[ArrayExpression]].map' },
        },
      ],
    },
  ],
});
