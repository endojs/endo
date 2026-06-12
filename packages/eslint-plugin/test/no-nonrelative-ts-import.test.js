'use strict';

const { RuleTester } = require('eslint');
const rule = require('../lib/rules/no-nonrelative-ts-import.js');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-nonrelative-ts-import', rule, {
  valid: [
    // Relative `.ts` imports are the supported pattern.
    "import { x } from './foo.ts';",
    "import { x } from '../sib/foo.ts';",
    "import type { T } from './types.ts';",
    "export { x } from './foo.ts';",
    "export * from './foo.ts';",
    "const p = import('./dyn.ts');",
    // Non-relative imports without a `.ts` extension are fine.
    "import { x } from '@endo/foo';",
    "import { x } from '@endo/foo/sub.js';",
    "import { x } from 'pkg';",
    // A `.ts` substring that is not the extension must not trip the rule.
    "import { x } from '@endo/foo.ts-utils';",
  ],
  invalid: [
    {
      code: "import { x } from '@endo/foo/src/bar.ts';",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
    {
      code: "import type { T } from '@endo/foo/types.ts';",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
    {
      code: "import { x } from 'pkg/sub.mts';",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
    {
      code: "export { x } from 'pkg/a.cts';",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
    {
      code: "export * from 'pkg/a.ts';",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
    {
      code: "const p = import('pkg/dyn.ts');",
      errors: [{ messageId: 'nonRelativeTs' }],
    },
  ],
});
