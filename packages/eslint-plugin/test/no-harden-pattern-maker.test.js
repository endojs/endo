const { RuleTester } = require('eslint');
const rule = require('../lib/rules/no-harden-pattern-maker');

const valid = [
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
];

const invalid = [
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
    errors: [
      // Outer harden(M.arrayOf(...)) fires; the inner M.string() is not a
      // harden call so only one report.
      { messageId: 'unnecessaryHardenOfPatternMaker' },
    ],
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
    // harden(M.string()) in expression position (not a statement) should
    // be replaced rather than removed.
    code: `const x = harden(M.string());`,
    errors: [{ messageId: 'unnecessaryHardenOfPatternMaker' }],
    output: `const x = M.string();`,
  },
];

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
});

tester.run('no-harden-pattern-maker', rule, {
  valid,
  invalid,
});
