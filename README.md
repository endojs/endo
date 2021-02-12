# eslint-plugin-agoric

Agoric-specific plugin

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-agoric`:

```
$ npm install eslint-plugin-agoric --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-agoric` globally.

## Usage

Add `agoric` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "agoric"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "agoric/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





