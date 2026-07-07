import { after, describe, it } from 'node:test';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tsParser from '@typescript-eslint/parser';
import rule from '../src/rules/harden-exports.js';

/** @import {InvalidTestCase} from '@typescript-eslint/rule-tester' */

/**
 * @typedef {'missingHardenCall' | 'functionExportNotConst' | 'unknownBindingPattern'} HardenExportsMessageId
 */

RuleTester.afterAll = after;
RuleTester.describe = describe;
RuleTester.it = it;

const jsValid = [
  {
    code: `
export const a = 1;
harden(a);
export const b = 2;
harden(b);
    `,
  },
  {
    code: `
export const {
  getEnvironmentOption,
  getEnvironmentOptionsList,
  environmentOptionsListHas,
  } = makeEnvironmentCaptor();
harden(getEnvironmentOption);
harden(getEnvironmentOptionsList);
harden(environmentOptionsListHas);
    `,
  },
  // Aliased destructuring: { propName: exportName } binds exportName.
  {
    code: `
export const { propName: exportName } = obj;
harden(exportName);
    `,
  },
  // Object rest binding.
  {
    code: `
export const { name, ...rest } = obj;
harden(name);
harden(rest);
    `,
  },
  // Nested object destructuring.
  {
    code: `
export const { name, parent: { subName } } = obj;
harden(name);
harden(subName);
    `,
  },
  // Array destructuring.
  {
    code: `
export const [ first, second ] = array;
harden(first);
harden(second);
    `,
  },
  // Array rest binding.
  {
    code: `
export const [ head, ...tail ] = array;
harden(head);
harden(tail);
    `,
  },
  // Sparse array hole; the hole introduces no binding.
  {
    code: `
export const [ , second ] = array;
harden(second);
    `,
  },
  // Default-value assignment patterns.
  {
    code: `
export const [ first = 1 ] = array;
harden(first);
    `,
  },
  {
    code: `
export const { name = 'default' } = obj;
harden(name);
    `,
  },
  {
    code: `
export const { propName: aliasName = 1 } = obj;
harden(aliasName);
    `,
  },
  // Deeply nested destructuring with array, object, alias and default.
  {
    code: `
export const [ { propName: aliasName = 1 }, [ inner ] ] = data;
harden(aliasName);
harden(inner);
    `,
  },
  {
    // Pattern makers (M.something(...)) return already-hardened values.
    code: `
export const StringShape = M.string();
    `,
  },
  {
    code: `
export const StringsShape = M.arrayOf(M.string());
    `,
  },
  {
    code: `
export const a = M.string();
export const b = M.arrayOf(M.string());
    `,
  },
  {
    // harden(name) on an M.* export is still allowed.
    code: `
export const StringShape = M.string();
harden(StringShape);
    `,
  },
];

/** @type {InvalidTestCase<HardenExportsMessageId, []>[]} */
const invalid = [
  {
    code: `
export const a = 'alreadyHardened';
export const b = 'toHarden';

harden(a);
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'b' } }],
    output: `
export const a = 'alreadyHardened';
export const b = 'toHarden';
harden(b);

harden(a);
    `,
  },
  {
    code: `
export const a = 1;
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'a' } }],
    output: `
export const a = 1;
harden(a);
    `,
  },
  {
    code: `
export function foo() {
    console.log("foo");
}
    `,
    errors: [{ messageId: 'functionExportNotConst', data: { name: 'foo' } }],
    // No autofix for function export style violations.
    output: null,
  },
  {
    code: `
export const {
getEnvironmentOption,
getEnvironmentOptionsList,
environmentOptionsListHas,
} = makeEnvironmentCaptor();
    `,
    errors: [
      {
        messageId: 'missingHardenCall',
        data: {
          names:
            'getEnvironmentOption, getEnvironmentOptionsList, environmentOptionsListHas',
        },
      },
    ],
    output: `
export const {
getEnvironmentOption,
getEnvironmentOptionsList,
environmentOptionsListHas,
} = makeEnvironmentCaptor();
harden(getEnvironmentOption);
harden(getEnvironmentOptionsList);
harden(environmentOptionsListHas);
    `,
  },
  {
    code: `
export const { propName: exportName } = obj;
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'exportName' } }],
    output: `
export const { propName: exportName } = obj;
harden(exportName);
    `,
  },
  {
    code: `
export const { name, ...rest } = obj;
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'name, rest' } }],
    output: `
export const { name, ...rest } = obj;
harden(name);
harden(rest);
    `,
  },
  {
    code: `
export const { name, ...rest } = obj;
harden(name);
harden(notRest);
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'rest' } }],
    output: `
export const { name, ...rest } = obj;
harden(rest);
harden(name);
harden(notRest);
    `,
  },
  {
    code: `
export const x = { foo: 1 };
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'x' } }],
    output: `
export const x = { foo: 1 };
harden(x);
    `,
  },
  {
    code: `
export const x = () => 1;
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'x' } }],
    output: `
export const x = () => 1;
harden(x);
    `,
  },
  {
    code: `
export const x = makeThing();
    `,
    errors: [{ messageId: 'missingHardenCall', data: { names: 'x' } }],
    output: `
export const x = makeThing();
harden(x);
    `,
  },
];

const jsTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});
jsTester.run('harden-exports (JS)', rule, { valid: jsValid, invalid });

const tsTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: tsParser,
  },
});
tsTester.run('harden-exports (TS)', rule, {
  valid: [
    ...jsValid,
    {
      // Type-only exports do not need harden().
      code: `
export type Foo = string;
export interface Bar {
    baz: number;
}
      `,
    },
    // TypeScript-annotated destructuring still binds the names; harden covers.
    {
      code: `
export const { name, ...rest }: { name: string; [k: string]: unknown } = obj;
harden(name);
harden(rest);
      `,
    },
  ],
  invalid: [
    ...invalid,
    // TypeScript-annotated destructuring missing harden calls.
    {
      code: `
export const { name, ...rest }: { name: string; [k: string]: unknown } = obj;
      `,
      errors: [
        { messageId: 'missingHardenCall', data: { names: 'name, rest' } },
      ],
      output: `
export const { name, ...rest }: { name: string; [k: string]: unknown } = obj;
harden(name);
harden(rest);
      `,
    },
  ],
});
