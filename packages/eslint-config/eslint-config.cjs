/* eslint-env node */
const path = require("path");
const process = require("process");

const dynamicConfig = {
  parserOptions: {},
  rules: {},
  overrides: [],
};

// Allow opting in to type-aware linting of either "src" directories or all code
// (but note that it can be too slow even for CI per
// https://github.com/Agoric/agoric-sdk/issues/5788 ).
const lintTypes = process.env.ENDO_LINT_TYPES;
if (lintTypes) {
  const validLintTypesValues = ["SRC", "FULL"];
  if (!validLintTypesValues.includes(lintTypes)) {
    // Intentionally avoid a SES `assert` dependency.
    const expected = JSON.stringify(validLintTypesValues);
    const actual = JSON.stringify(lintTypes);
    throw new RangeError(
      `ENDO_LINT_TYPES must be one of ${expected}, not ${actual}`
    );
  }

  const isFull = lintTypes === "FULL";
  // typescript-eslint has its own config that must be dynamically referenced
  // to include vs. exclude non-"src" files because it cannot itself be dynamic.
  // https://github.com/microsoft/TypeScript/issues/30751
  const rootTsProjectGlob = isFull
    ? "./{js,ts}config.eslint-full.json"
    : "./{js,ts}config.eslint-src.json";
  const parserOptions = {
    tsconfigRootDir: path.join(__dirname, "../.."),
    project: [rootTsProjectGlob, "packages/*/{js,ts}config.eslint.json"],
  };
  const rules = {
    "@typescript-eslint/restrict-plus-operands": "error",
  };
  if (isFull) {
    dynamicConfig.parserOptions = parserOptions;
    dynamicConfig.rules = rules;
  } else {
    dynamicConfig.overrides = [
      {
        files: ["**/src/**/*.{js,ts}"],
        parserOptions,
        rules,
      },
    ];
  }
}

module.exports = {
  "extends": [
    "airbnb-base",
    "plugin:prettier/recommended",
    "plugin:jsdoc/recommended",
    "plugin:@jessie.js/recommended",
    "plugin:@endo/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "parserOptions": dynamicConfig.parserOptions,
  "rules": {
    ...dynamicConfig.rules,
    "quotes": [
      "error",
      "single",
      {
        "avoidEscape": true,
        "allowTemplateLiterals": true
      }
    ],
    "comma-dangle": ["error", "always-multiline"],
    "implicit-arrow-linebreak": "off",
    "function-paren-newline": "off",
    "arrow-parens": "off",
    "strict": "off",
    "prefer-destructuring": "off",
    "no-else-return": "off",
    "no-console": "off",
    "no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }
    ],
    "no-return-assign": "off",
    "no-param-reassign": "off",
    "no-restricted-syntax": ["off", "ForOfStatement"],
    "no-unused-expressions": "off",
    "no-loop-func": "off",
    "no-inner-declarations": "off",
    "guard-for-in": "error",
    "import/extensions": "off",
    "import/no-extraneous-dependencies": [
      "error",
      {
        "devDependencies": [
          "**/*.config.js",
          "**/*.config.*.js",
          "*test*/**/*.js",
          "demo*/**/*.js",
          "scripts/**/*.js"
        ]
      }
    ],

    // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
    "import/no-unresolved": ["error", { "ignore": ["ava"] }],
    "import/prefer-default-export": "off",

    "jsdoc/no-multi-asterisks": ["warn", { "allowWhitespace": true }],
    "jsdoc/no-undefined-types": "off",
    "jsdoc/require-jsdoc": "off",
    "jsdoc/require-property-description": "off",
    "jsdoc/require-param-description": "off",
    "jsdoc/require-returns": "off",
    "jsdoc/require-returns-description": "off",
    "jsdoc/require-yields": "off",
    "jsdoc/tag-lines": "off",
    "jsdoc/valid-types": "off"
  },
  "overrides": [
    {
      "files": ["**/*.{js,ts}"]
    },
    {
      "files": ["**/*.ts"],
      "rules": {
        "import/no-unresolved": "off",
        "no-unused-vars": "off"
      }
    },
    ...dynamicConfig.overrides
  ],
  "ignorePatterns": [
    "**/output/**",
    "bundles/**",
    "dist/**",
    "test262/**",
    "ava*.config.js"
  ]
};
