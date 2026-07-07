# @endo/eslint-plugin

ESLint rules and shareable configs for [Hardened JavaScript](https://hardenedjs.org/) and [Endo](https://github.com/endojs/endo) packages.

## Installation

```sh
npm install --save-dev eslint @endo/eslint-plugin
```

---

## Usage

### ESLint 9+ (Flat Config)

In your `eslint.config.js` (or `.mjs`/`.cjs`):

```js
import endoPlugin from '@endo/eslint-plugin';

export default [
  // Apply the recommended rules for Hardened JS code.
  ...endoPlugin.configs['flat/recommended'],
];
```

### ESLint 8 (Legacy Config)

In your `.eslintrc.json` (or `.eslintrc.js`, etc.):

```json
{
  "extends": ["plugin:@endo/recommended"]
}
```

---

## Shareable Configs

### `recommended` / `flat/recommended`

Core rules for code written to run under Hardened JavaScript (post-`lockdown()`).

```js
// flat config
...endoPlugin.configs['flat/recommended']

// legacy
{ "extends": ["plugin:@endo/recommended"] }
```

> **Breaking change (v3):** This config no longer bundles `@jessie.js/eslint-plugin`. Consumers who want the Jessie `safe-await-separator` rule and the `use-jessie` processor must install `@jessie.js/eslint-plugin` and configure it directly:
>
> ```js
> import jessie from '@jessie.js/eslint-plugin';
> import endo from '@endo/eslint-plugin';
>
> export default [
>   ...endo.configs['flat/recommended'],
>   ...jessie.configs['flat/recommended'],
>   { processor: jessie.processors['use-jessie'] },
> ];
> ```

### `recommended-requiring-type-checking` / `flat/recommended-requiring-type-checking`

Extends `recommended` and adds the [`restrict-comparison-operands`](docs/rules/restrict-comparison-operands.md) rule, which requires TypeScript type information.

```js
// flat config
...endoPlugin.configs['flat/recommended-requiring-type-checking']

// legacy
{ "extends": ["plugin:@endo/recommended-requiring-type-checking"] }
```

### `style` / `flat/style`

Opinionated JS coding-style rules: [@stylistic/eslint-plugin](https://eslint.style/), [jsdoc](https://github.com/gajus/eslint-plugin-jsdoc), and [prettier](https://github.com/prettier/eslint-config-prettier). 

```js
...endoPlugin.configs['flat/style']
```

### `imports` / `flat/imports`

Rules about how packages should use imports: require file extensions, disallow extraneous dependencies, prefer named exports.

```js
...endoPlugin.configs['flat/imports']
```

### `strict` / `flat/strict`

`style` + `imports` + `recommended` in one config.

```js
...endoPlugin.configs['flat/strict']
```

### `internal` / `flat/internal`

The opinionated baseline used by all packages _within the Endo monorepo itself_. Extends `strict` and adds TypeScript-ESLint. Not intended for external use.

```js
...endoPlugin.configs['flat/internal']
```

### `ses` / `flat/ses`

Extends `internal` with strict global-variable restrictions for SES bootstrap code that runs before `lockdown()`.

```js
...endoPlugin.configs['flat/ses']
```

### `daemon` / `flat/daemon` _(deprecated)_

Alias for `internal`/`flat/internal`.

---

## Rules

| Rule | Description | Fixable |
|------|-------------|---------|
| [@endo/assert-fail-as-throw](docs/rules/assert-fail-as-throw.md) | Make `assert.fail()` count as a throw in ESLint's control-flow analysis | — |
| [@endo/harden-exports](docs/rules/harden-exports.md) | Ensure each named export is immediately followed by `harden()` | 🔧 |
| [@endo/no-assign-to-exported-let-var-or-function](docs/rules/no-assign-to-exported-let-var-or-function.md) | Disallow reassignment of exported `let`/`var`/`function` bindings | — |
| [@endo/no-harden-pattern-maker](docs/rules/no-harden-pattern-maker.md) | Warn when hardening pattern-maker return values (they are already hardened) | — |
| [@endo/no-multi-name-local-export](docs/rules/no-multi-name-local-export.md) | Disallow exporting the same local binding under multiple names | — |
| [@endo/no-polymorphic-call](docs/rules/no-polymorphic-call.md) | Disallow method calls on non-local receiver objects | — |
| [@endo/restrict-comparison-operands](docs/rules/restrict-comparison-operands.md) | Restrict `<`/`>`/`<=`/`>=` to operands of compatible types | — |

---

## Configuring Individual Rules

```js
// flat config
export default [
  {
    plugins: { '@endo': endoPlugin },
    rules: {
      '@endo/harden-exports': 'error',
      '@endo/no-polymorphic-call': 'warn',
    },
  },
];
```

```json
// legacy (.eslintrc.json)
{
  "plugins": ["@endo"],
  "rules": {
    "@endo/harden-exports": "error",
    "@endo/no-polymorphic-call": "warn"
  }
}
```

---

## Compatibility

| ESLint version | How to use |
|----------------|------------|
| 9.x | `eslint.config.js` flat config, use `flat/*` configs |
| 8.x | `.eslintrc.*` legacy config, use bare config names |

The plugin ships both legacy (`recommended`, `internal`, …) and flat (`flat/recommended`, `flat/internal`, …) configs so you can use whichever ESLint version your project requires.
