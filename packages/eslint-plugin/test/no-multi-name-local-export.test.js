'use strict';

const { RuleTester } = require('eslint');
const rule = require('../lib/rules/no-multi-name-local-export.js');

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-multi-name-local-export', rule, {
  valid: [
    'const foo = 1; export { foo };',
    'const foo = 1; export { foo as bar };',
    'const a = 1, b = 2; export { a, b as c };',
    "export { x as y } from 'mod';",
    "export * from 'mod';",
    'const foo = 1; export default foo; export { foo };',
    'const foo = 1; export { foo as default };',
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
