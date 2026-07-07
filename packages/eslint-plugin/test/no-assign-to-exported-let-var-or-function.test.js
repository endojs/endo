import { describe, it, after as afterAll } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-assign-to-exported-let-var-or-function.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

tester.run('no-assign-to-exported-let-var-or-function', rule, {
  valid: [
    // Not exported — allowed.
    { code: 'let x = 1; x = 2;' },
    { code: 'var a = 0; a++;' },
    { code: 'function f() {} f = f;' },

    // Exported const — parser forbids assignment anyway; no false positive.
    { code: 'export const k = 1; const z = k + 1;' },

    // Member/property writes are fine.
    {
      code: 'export let obj = {}; obj.x = 1; ({obj: {x: obj.x}} = {obj:{x:2}});',
    },

    // Re-export from another module (no local binding).
    { code: "export { q } from 'dep'; q = 1;" },

    // Shadowing: inner scope assignment is OK.
    {
      code: `
export let y = 1;
function g() {
  let y = 0;
  y = 3; y++;
}`,
    },

    // Destructuring that does NOT target exported names.
    {
      code: `
export let a1 = 1, a2 = 2;
({ b1: a1copy } = { b1: 5 });
`,
    },

    // Default export function — no module-level binding to reassign.
    { code: 'export default function Foo() {}' },

    // Exported class is not targeted by this rule.
    { code: 'export class C {} C.prototype.m = 1;' },
  ],

  invalid: [
    {
      code: 'export let x = 1; x = 2;',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    {
      code: 'export var z = 0; z += 1;',
      errors: [{ messageId: 'noAssign', data: { name: 'z' } }],
    },
    {
      code: 'export let x = 0; ({ x } = { x: 2 });',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    {
      code: 'export let x; [x] = [1];',
      errors: [{ messageId: 'noAssign', data: { name: 'x' } }],
    },
    {
      code: 'export let counter = 0; counter++;',
      errors: [{ messageId: 'noAssign', data: { name: 'counter' } }],
    },
    {
      code: 'let y = 1; export { y }; y = 3;',
      errors: [{ messageId: 'noAssign', data: { name: 'y' } }],
    },
    {
      code: 'let local = 1; export { local as renamed }; local++;',
      errors: [{ messageId: 'noAssign', data: { name: 'local' } }],
    },
    {
      code: 'export function f() {} f = 1;',
      errors: [{ messageId: 'noAssign', data: { name: 'f' } }],
    },
    {
      code: 'function g() {} export { g }; g = () => {};',
      errors: [{ messageId: 'noAssign', data: { name: 'g' } }],
    },
    {
      code: 'export let a; ({ b: { c: a } } = { b: { c: 1 } });',
      errors: [{ messageId: 'noAssign', data: { name: 'a' } }],
    },
    {
      code: 'export let rest; ({ ...rest } = {});',
      errors: [{ messageId: 'noAssign', data: { name: 'rest' } }],
    },
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
