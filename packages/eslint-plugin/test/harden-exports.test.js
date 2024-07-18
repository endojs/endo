const { RuleTester } = require('eslint');
const rule = require('../lib/rules/harden-exports');

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2015, sourceType: 'module' },
});
ruleTester.run('harden-exports', rule, {
  valid: [
    {
      code: `
                export const a = 1;
                export const b = 2;
                harden({ a, b });
            `,
    },
  ],
  invalid: [
    {
      code: `
                export const a = 1;
                export const b = 2;
                harden({ a });
            `,
      errors: [{ message: 'Missing exports in harden call: b' }],
    },
    {
      code: `
                export const a = 1;
                export const b = 2;
            `,
      errors: [{ message: "No call to 'harden' found in the module." }],
    },
  ],
});
