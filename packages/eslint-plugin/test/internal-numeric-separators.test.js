'use strict';

// Wiring test for the `unicorn/numeric-separators-style` rule as it is enabled
// by the `@endo/eslint-plugin/configs/internal` preset.
//
// The cleaner pass on PR #244 (`chore(eslint-plugin): require
// underscore-delimited groups in numeric literals`) added this rule to the
// preset's `rules` table. There is no new rule in this repo to test directly;
// what this file pins is the preset's *wiring*: the preset declares the
// unicorn plugin, enables the rule at `error` severity, and the option object
// is carried through verbatim, exercising all four literal kinds the changeset
// enumerates (decimal, hexadecimal, binary, octal) with the conventional group
// lengths the rule applies.
//
// Reverting any single key of the rule's option object in
// `lib/configs/internal.js` (e.g., dropping the `binary` clause) fails one of
// the assertions below; that is the regression evidence per
// `garden/skills/regression-evidence/SKILL.md`.
import assert from 'node:assert';
import { RuleTester } from 'eslint';
import unicorn from 'eslint-plugin-unicorn';
import internal from '../src/configs/internal.js';

const RULE_ID = 'unicorn/numeric-separators-style';
const ruleConfig = internal.rules[RULE_ID];

// --- Wiring assertions (synchronous, module-load time) -----------------------

assert.ok(
  Array.isArray(internal.plugins) && internal.plugins.includes('unicorn'),
  'internal preset must declare the unicorn plugin',
);

assert.ok(Array.isArray(ruleConfig), `${RULE_ID} entry must be an array`);
assert.strictEqual(
  ruleConfig[0],
  'error',
  `${RULE_ID} must be enabled at error severity`,
);

assert.deepStrictEqual(
  ruleConfig[1],
  {
    onlyIfContainsSeparator: false,
    number: { minimumDigits: 5, groupLength: 3 },
    binary: { minimumDigits: 0, groupLength: 4 },
    octal: { minimumDigits: 0, groupLength: 4 },
    hexadecimal: { minimumDigits: 0, groupLength: 4 },
  },
  `${RULE_ID} option object must match the changeset-declared shape`,
);

// --- Behavior assertions -----------------------------------------------------
//
// RuleTester runs valid/invalid arrays under its own mocha-compatible
// describe/it harness, matching the style of the package's other tests
// (harden-exports, no-multi-name-local-export, no-assign-to-exported-let-var-or-function).

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2021, sourceType: 'script' },
});

const ruleOptions = ruleConfig[1];

const rule = unicorn.rules?.['numeric-separators-style'];
assert.ok(rule, 'unicorn.rules["numeric-separators-style"] must be defined');

tester.run('internal preset: unicorn/numeric-separators-style options', rule, {
  valid: [
    // Below the 5-digit threshold for decimal.
    { code: 'const n = 1000;', options: [ruleOptions] },
    { code: 'const n = 9999;', options: [ruleOptions] },
    // Already in canonical form.
    { code: 'const n = 1_000_000;', options: [ruleOptions] },
    { code: 'const n = 0xABCD;', options: [ruleOptions] },
    { code: 'const n = 0xAB_CDEF;', options: [ruleOptions] },
    { code: 'const n = 0b1111_0000;', options: [ruleOptions] },
    { code: 'const n = 0o1234_5670;', options: [ruleOptions] },
  ],
  invalid: [
    // Decimal: groupLength 3 from the right, kicks in at five digits.
    {
      code: 'const n = 10000;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 10_000;',
    },
    {
      code: 'const n = 100000;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 100_000;',
    },
    {
      code: 'const n = 1234567;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 1_234_567;',
    },
    // BigInt literals follow the decimal grouping.
    {
      code: 'const n = 1234567890123n;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 1_234_567_890_123n;',
    },
    // Hex: groupLength 4, minimumDigits 0 (case preserved).
    {
      code: 'const n = 0xabcdef;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 0xab_cdef;',
    },
    {
      code: 'const n = 0xABCDEF;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 0xAB_CDEF;',
    },
    // Binary: groupLength 4, minimumDigits 0.
    {
      code: 'const n = 0b11110000;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 0b1111_0000;',
    },
    // Octal: groupLength 4, minimumDigits 0.
    {
      code: 'const n = 0o12345670;',
      options: [ruleOptions],
      errors: [{ messageId: 'numeric-separators-style' }],
      output: 'const n = 0o1234_5670;',
    },
  ],
});
