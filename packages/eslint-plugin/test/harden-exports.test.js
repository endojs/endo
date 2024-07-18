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
export function foo() {
      console.log("foo");
  }
harden(foo);
export const a = 1;
harden(a);
              `,
  },
  {
    code: `
export const a = 1;
harden(a);
export function bar() {
      console.log("bar");
  }
harden(bar);
              `,
  },
  {
    code: `
export const a = 1;
harden(a);
export function
  multilineFunction() {
      console.log("This is a multiline function.");
  }
harden(multilineFunction);
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
        message:
          "The named export 'b' should be followed by a call to 'harden'.",
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
          "The named export 'a' should be followed by a call to 'harden'.",
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
          "The named export 'foo' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export function foo() {
      console.log("foo");
  }
harden(foo);
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
          "The named export 'multilineFunction' should be followed by a call to 'harden'.",
      },
    ],
    output: `
export function
  multilineFunction() {
      console.log("This is a multiline function.");
  }
harden(multilineFunction);
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
          "The named export 'a' should be followed by a call to 'harden'.",
      },
      {
        message:
          "The named export 'b' should be followed by a call to 'harden'.",
      },
      {
        message:
          "The named export 'foo' should be followed by a call to 'harden'.",
      },
      {
        message:
          "The named export 'multilineFunction' should be followed by a call to 'harden'.",
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
harden(foo);
export function
  multilineFunction() {
  console.log("This is a multiline function.");
  }
harden(multilineFunction);
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
          "The named exports 'getEnvironmentOption, getEnvironmentOptionsList, environmentOptionsListHas' should be followed by a call to 'harden'.",
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
