'use strict';

const { RuleTester } = require('eslint');
const rule = require('../lib/rules/no-assign-to-exported-let-var-or-function.js');

// Use the newest syntax defaults.
const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

ruleTester.run('no-assign-to-exported-let-var-or-function', rule, {
  valid: [
    // Not exported — allowed
    'let x = 1; x = 2;',
    'var a = 0; a++;',
    'function f() {} f = f;',

    // Exported const — parser would forbid assignment anyway, but ensure no false positive when *reading*.
    'export const k = 1; const z = k + 1;',

    // Member/property writes are fine
    'export let obj = {}; obj.x = 1; ({obj: {x: obj.x}} = {obj:{x:2}});',

    // Re-export from another module (no local binding)
    "export { q } from 'dep'; q = 1; // not a local; assignment is a reference error at runtime but rule must ignore",

    // Shadowing: inner scope assignment is OK
    `
      export let y = 1;
      function g() {
        let y = 0;
        y = 3; y++;
      }`,

    // Destructuring that does NOT target exported names
    `
      export let a1 = 1, a2 = 2;
      ({ b1: a1copy } = { b1: 5 }); // assigning a1copy, not a1
      `,

    // Default export function with a name shouldn't create a module-level binding to reassign
    'export default function Foo() {}',

    // Exported class is not targeted by this rule
    'export class C {} C.prototype.m = 1;',
  ],

  invalid: [
    // Inline exported let
    {
      code: 'export let x = 1; x = 2;',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    // Inline exported var (+=)
    {
      code: 'export var z = 0; z += 1;',
      errors: [{ messageId: 'noAssign', data: { name: 'z' } }],
    },
    // Inline exported let (destructuring)
    {
      code: 'export let x = 0; ({ x } = { x: 2 });',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    // Inline exported let (array pattern)
    {
      code: 'export let x; [x] = [1];',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    // Inline exported let (update)
    {
      code: 'export let counter = 0; counter++;',
      errors: [{ messageId: 'noAssign', data: { name: 'counter' } }],
    },
    // Separate export of local let
    {
      code: 'let y = 1; export { y }; y = 3;',
      errors: [{ messageId: 'noAssign', data: { name: 'y' } }],
    },
    // Separate export with alias
    {
      code: 'let local = 1; export { local as renamed }; local++;',
      errors: [{ messageId: 'noAssign', data: { name: 'local' } }],
    },
    // Exported function declaration reassigned
    {
      code: 'export function f() {} f = 1;',
      errors: [{ messageId: 'noAssign', data: { name: 'f' } }],
    },
    // Local function exported later and reassigned
    {
      code: 'function g() {} export { g }; g = () => {};',
      errors: [{ messageId: 'noAssign', data: { name: 'g' } }],
    },
    // Nested destructuring hitting an exported binding
    {
      code: 'export let a; ({ b: { c: a } } = { b: { c: 1 } });',
      errors: [{ messageId: 'noAssign', data: { name: 'a' } }],
    },
    // Rest patterns hitting an exported binding
    {
      code: 'export let rest; ({ ...rest } = {});',
      errors: [{ messageId: 'noAssign', data: { name: 'rest' } }],
    },
    // Multiple targets: only exported ones should error (RuleTester expects at least one)
    {
      code: `
          export let x = 0;
          let y = 0;
          ({ x, y } = { x: 1, y: 2 });
        `,
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
  ],
});
