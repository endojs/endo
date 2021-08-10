# eslint-plugin-agoric

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

Add `@endo` to the plugins section of your `.eslintrc` configuration file. You can omit the `/eslint-plugin` suffix:

```json
{
    "plugins": [
        "@endo"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "@endo/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





