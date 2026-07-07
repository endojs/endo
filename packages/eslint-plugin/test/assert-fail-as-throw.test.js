import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/assert-fail-as-throw.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// This rule monkeypatches ESLint's internal code-path analysis to treat
// assert.fail() as a throw. Since ESLint 8.23+ restricts access to its
// internal modules via package.json "exports", the rule gracefully degrades
// to a no-op when the internals are not accessible.
//
// Regardless, the rule module itself must be syntactically valid and load
// without errors, and must produce no reports on any code (it is a
// side-effect-only rule with zero messages).
tester.run('assert-fail-as-throw', rule, {
  valid: [
    { code: 'assert.fail("oops");' },
    { code: 'function mayFail() { if (false) { assert.fail(); } return 1; }' },
    { code: 'const x = 1;' },
  ],
  invalid: [],
});
