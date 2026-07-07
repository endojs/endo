import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-harden-pattern-maker.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-harden-pattern-maker', rule, {
  valid: [
    // Plain object literals still need harden().
    { code: `harden({ foo: 1 });` },
    // Other call expressions are not Pattern makers.
    { code: `const a = makeFoo(); harden(a);` },
    // `M` referenced as a value (not as `M.foo()`) is fine.
    { code: `harden(globalThis.M);` },
    // Only the bare identifier `M` is recognized as the Pattern namespace.
    { code: `harden(thirdPartyM.string());` },
    // harden of an unrelated identifier whose initializer is not a call.
    { code: `const a = 1; harden(a);` },
    // harden(M) — `M` itself, not a member call — is left alone.
    { code: `harden(M);` },
    // Nested function with its own binding shadowing an outer one.
    {
      code: `
const a = makeOther();
function f() {
  harden(a);
}
      `,
    },
  ],
  invalid: [
    {
      code: `harden(M.string());`,
      errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
      output: ``,
    },
    {
      code: `const a = M.string(); harden(a);`,
      errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
      output: `const a = M.string();`,
    },
    {
      code: `harden(M.arrayOf(M.string()));`,
      errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
      output: ``,
    },
    {
      code: `
function f() {
  const a = M.recordOf(M.string(), M.any());
  harden(a);
}
`,
      errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
      output: `
function f() {
  const a = M.recordOf(M.string(), M.any());
\n}
`,
    },
    {
      // In expression position, replace `harden(x)` with `x`.
      code: `const x = harden(M.string());`,
      errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
      output: `const x = M.string();`,
    },
  ],
});
