import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-multi-name-local-export.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-multi-name-local-export', rule, {
  valid: [
    { code: 'const foo = 1; export { foo };' },
    { code: 'const foo = 1; export { foo as bar };' },
    { code: 'const a = 1, b = 2; export { a, b as c };' },
    { code: "export { x as y } from 'mod';" },
    { code: "export * from 'mod';" },
    { code: 'const foo = 1; export default foo; export { foo };' },
    { code: 'const foo = 1; export { foo as default };' },
  ],
  invalid: [
    {
      code: 'const foo = 1; export { foo, foo as bar };',
      errors: [{ messageId: 'multiple' }],
    },
    {
      code: 'const foo = 1; export { foo as bar, foo as baz };',
      errors: [{ messageId: 'multiple' }],
    },
    {
      code: 'const foo = 1; export { foo }; export { foo as bar };',
      errors: [{ messageId: 'multiple' }],
    },
    {
      code: 'export const a = 1; export { a as b };',
      errors: [{ messageId: 'multiple' }],
    },
  ],
});
