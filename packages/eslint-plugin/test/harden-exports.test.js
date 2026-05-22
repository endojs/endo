const { RuleTester } = require('eslint');
const rule = require('../lib/rules/harden-exports');

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
  // Default-value assignment patterns in array and object destructuring.
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
];

const invalid = [
  {
    code: `
export const a = 'alreadyHardened';
export const b = 'toHarden';

harden(a);
              `,
    errors: [
      {
        message:
          "Named export(s) 'b' should be followed by a call to 'harden'.",
      },
    ],
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
    errors: [
      {
        message:
          "Named export(s) 'a' should be followed by a call to 'harden'.",
      },
    ],
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
    errors: [
      {
        message:
          "Export 'foo' should be a const declaration with an arrow function.",
      },
    ],
    output: `
export function foo() {
      console.log("foo");
  }
              `,
  },
  {
    code: `
export function
  multilineFunction() {
      console.log("This is a multiline function.");
  }
              `,
    errors: [
      {
        message:
          "Export 'multilineFunction' should be a const declaration with an arrow function.",
      },
    ],
    output: `
export function
  multilineFunction() {
      console.log("This is a multiline function.");
  }
              `,
  },
  {
    code: `
export const a = 1;
export const b = 2;

export const alreadyHardened = 3;
harden(alreadyHardened);

export function foo() {
  console.log("foo");
  }
export function
  multilineFunction() {
  console.log("This is a multiline function.");
  }
        `,
    errors: [
      {
        message:
          "Named export(s) 'a' should be followed by a call to 'harden'.",
      },
      {
        message:
          "Named export(s) 'b' should be followed by a call to 'harden'.",
      },
      {
        message:
          "Export 'foo' should be a const declaration with an arrow function.",
      },
      {
        message:
          "Export 'multilineFunction' should be a const declaration with an arrow function.",
      },
    ],
    output: `
export const a = 1;
harden(a);
export const b = 2;
harden(b);

export const alreadyHardened = 3;
harden(alreadyHardened);

export function foo() {
  console.log("foo");
  }
export function
  multilineFunction() {
  console.log("This is a multiline function.");
  }
        `,
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
        message:
          "Named export(s) 'getEnvironmentOption, getEnvironmentOptionsList, environmentOptionsListHas' should be followed by a call to 'harden'.",
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
  // Aliased destructuring: only the alias is the binding name; the rule
  // must not chase the source property name.
  {
    code: `
export const { propName: exportName } = obj;
    `,
    errors: [
      {
        message:
          "Named export(s) 'exportName' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { propName: exportName } = obj;
harden(exportName);
    `,
  },
  // Object rest.
  {
    code: `
export const { name, ...rest } = obj;
    `,
    errors: [
      {
        message:
          "Named export(s) 'name, rest' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { name, ...rest } = obj;
harden(name);
harden(rest);
    `,
  },
  // Nested object pattern.
  {
    code: `
export const { name, parent: { subName } } = obj;
    `,
    errors: [
      {
        message:
          "Named export(s) 'name, subName' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { name, parent: { subName } } = obj;
harden(name);
harden(subName);
    `,
  },
  // Array pattern.
  {
    code: `
export const [ first, second ] = array;
    `,
    errors: [
      {
        message:
          "Named export(s) 'first, second' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const [ first, second ] = array;
harden(first);
harden(second);
    `,
  },
  // Array rest.
  {
    code: `
export const [ head, ...tail ] = array;
    `,
    errors: [
      {
        message:
          "Named export(s) 'head, tail' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const [ head, ...tail ] = array;
harden(head);
harden(tail);
    `,
  },
  // Sparse array hole introduces no binding for the hole.
  {
    code: `
export const [ , second ] = array;
    `,
    errors: [
      {
        message:
          "Named export(s) 'second' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const [ , second ] = array;
harden(second);
    `,
  },
  // Default-value (AssignmentPattern) bindings.
  {
    code: `
export const [ first = 1 ] = array;
    `,
    errors: [
      {
        message:
          "Named export(s) 'first' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const [ first = 1 ] = array;
harden(first);
    `,
  },
  {
    code: `
export const { name = 'default' } = obj;
    `,
    errors: [
      {
        message:
          "Named export(s) 'name' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { name = 'default' } = obj;
harden(name);
    `,
  },
  {
    code: `
export const { propName: aliasName = 1 } = obj;
    `,
    errors: [
      {
        message:
          "Named export(s) 'aliasName' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { propName: aliasName = 1 } = obj;
harden(aliasName);
    `,
  },
  // Deeply nested destructuring combining array, object, alias and default.
  {
    code: `
export const [ { propName: aliasName = 1 }, [ inner ] ] = data;
    `,
    errors: [
      {
        message:
          "Named export(s) 'aliasName, inner' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const [ { propName: aliasName = 1 }, [ inner ] ] = data;
harden(aliasName);
harden(inner);
    `,
  },
  // Object rest with a hardened sibling but a different identifier hardened
  // alongside: the rule must still flag the rest binding by its own name and
  // not be fooled by an unrelated harden() call.
  {
    code: `
export const { name, ...rest } = obj;
harden(name);
harden(notRest);
    `,
    errors: [
      {
        message:
          "Named export(s) 'rest' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export const { name, ...rest } = obj;
harden(rest);
harden(name);
harden(notRest);
    `,
  },
];

const jsTester = new RuleTester({
  parserOptions: { ecmaVersion: 2018, sourceType: 'module' },
});
jsTester.run('harden JS exports', rule, {
  valid: jsValid,
  invalid,
});

const tsTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2018, sourceType: 'module' },
});
tsTester.run('harden TS exports', rule, {
  valid: [
    ...jsValid,
    {
      // harden() on only value exports
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
    // TypeScript-annotated destructuring missing harden calls; the rule must
    // see through the type annotation and report the value bindings.
    {
      code: `
export const { name, ...rest }: { name: string; [k: string]: unknown } = obj;
    `,
      errors: [
        {
          message:
            "Named export(s) 'name, rest' should be followed by a call to 'harden'.",
        },
      ],
      output: `
export const { name, ...rest }: { name: string; [k: string]: unknown } = obj;
harden(name);
harden(rest);
    `,
    },
  ],
});
