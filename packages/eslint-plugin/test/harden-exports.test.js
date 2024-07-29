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
        message: "Named export 'b' should be followed by a call to 'harden'.",
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
        message: "Named export 'a' should be followed by a call to 'harden'.",
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
        message: "Named export 'a' should be followed by a call to 'harden'.",
      },
      {
        message: "Named export 'b' should be followed by a call to 'harden'.",
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
          "Named exports 'getEnvironmentOption, getEnvironmentOptionsList, environmentOptionsListHas' should be followed by a call to 'harden'.",
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
];

const jsTester = new RuleTester({
  parserOptions: { ecmaVersion: 2015, sourceType: 'module' },
});
jsTester.run('harden JS exports', rule, {
  valid: jsValid,
  invalid,
});

const tsTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2015, sourceType: 'module' },
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
  ],
  invalid,
});
