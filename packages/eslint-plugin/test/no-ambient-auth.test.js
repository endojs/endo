const { RuleTester } = require('eslint');
const rule = require('../lib/rules/no-ambient-auth.js');

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2015, sourceType: 'module' },
});

ruleTester.run('no-ambient-auth-imports', rule, {
  valid: [
    {
      code: "import path from 'node:path';",
      options: [{ ambientAuthModules: ['node:fs'] }],
    },
    {
      code: "import { readFile } from 'fs/promises';",
      options: [{ ambientAuthModules: ['node:fs'] }],
    },
    {
      code: "const fs = require('fs');",
      options: [{ ambientAuthModules: ['node:fs'] }],
    },
  ],
  invalid: [
    {
      code: "import fs from 'node:fs';",
      options: [{ ambientAuthModules: ['node:fs'] }],
      errors: [{ messageId: 'ambientAuthImport' }],
    },
    {
      code: "import { readFile } from 'node:fs';",
      options: [{ ambientAuthModules: ['node:fs'] }],
      errors: [{ messageId: 'ambientAuthImport' }],
    },
    {
      code: `
        import fs from 'node:fs';
        export const myReadFile = (str) => fs.readFile(str);
      `,
      options: [{ ambientAuthModules: ['node:fs'] }],
      errors: [
        { messageId: 'ambientAuthImport' },
        { messageId: 'ambientAuthImport' },
      ],
    },
    {
      code: `
        import { readFile } from 'node:fs';
        export const myReadFile = readFile;
      `,
      options: [{ ambientAuthModules: ['node:fs'] }],
      errors: [
        { messageId: 'ambientAuthImport' },
        { messageId: 'ambientAuthImport' },
      ],
    },
  ],
});
