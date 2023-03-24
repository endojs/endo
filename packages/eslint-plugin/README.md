# @endo/eslint-plugin

Endo-specific plugin

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `@endo/eslint-plugin`:

```
$ npm install @endo/eslint-plugin --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `@endo/eslint-plugin` globally.

## Usage

Extend a `plugin:@endo/CONFIG` in your `.eslintrc` configuration file. You can omit the `/eslint-plugin` suffix:

```json
{
    "extends": [
        "plugin:@endo/recommended"
    ]
}
```

`CONFIG` can be one of:

- `recommended` rules for code compatible with Hardened JS
- `imports` opinions on how packages should use imports
- `style` opinions on JS coding style
- `strict` all of the above
- `internal` rules only for packages within the Endo source repository


You can configure individual rules you want to use under the rules section.

```json
{
    "rules": {
        "@endo/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





