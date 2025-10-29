# `@endo/ses-ava`

*SES-AVA* wraps AVA `test` functions and initializes the SES-shim with options
suitable for debugging tests. This includes logging errors to the console with
- deep stacks of prior turns
- unredacted stack traces
- unredacted error messages

To use this module, in your AVA test files, replace

```js
import 'ses'; // or however you initialize the SES-shim
import test from 'ava';
```
with
```js
import test from '@endo/ses-ava/prepare-endo.js';
```
and add
```json
  "devDependencies": {
    // ...
    "@endo/ses-ava": "...", // for the current version of @endo/ses-ava
    // ...
  },
```
specifically to "devDependencies". @endo/ses-ava itself depends on AVA as
a regular dependency, so it you include @endo/ses-ava as a regular
dependency, bundlers might bundle your code with all of AVA.

SES-AVA rhymes with Nineveh.

# Supporting multiple configurations

SES-AVA also provides a command line tool, `ses-ava`, that can run AVA with
multiple configurations in a single command, intercepting flags to filter
for interesting configurations.
The `ses-ava` command consumes the `"ava"` and (new) `"sesAvaConfigs"` properties
in `package.json` to discover and name the supported configurations which can be
referenced by `--only` and `--exclude` options (and their respective `-o` and
`-x` shorthands), where the `"ava"` configuration is the `default`, if present.

With appropriate configurations, packages can run many of the same tests
with or without an initialized Endo environment.
This is useful for Endo's _Hardened Modules_: modules that use `harden` to
defend the integrity of their interface, with varying degrees of defense depending
on whether they're used in composition with HardenedJS's `lockdown`.

For tests that might be used regardless of the environment, SES-AVA provides
an `@endo/ses-ava/test.js` module.
It exports the `test` from `ava` by default.
But with the `node` condition `ses-ava:endo`, it exports a wrapped `test`
that unredacts errors, so tests see the original error messages that would
otherwise be redacted by SES's Assert machinery.

```js
import test from '@endo/ses-ava/test.js';
```

SES-AVA then enables different AVA configurations to set up different
environments.
For example, the `lockdown` configuration might look like:

```js
export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  nodeArguments: ['-C', 'ses-ava:endo']
};
```

This relies on SES-AVA  to initialize an
Endo environment, including the SES shims and Eventual Send shim, and also
register the SES-AVA wrapped `test` declarator, which can unredact error
messages produced by the Assert shim from SES.
If the test doesn't import `@endo/ses-ava/test.js`, requiring
`@endo/ses-ava/prepare-endo-config.js` ensures the environment is fully
initialized.
In the root of the Endo repository, look at the `ava-*.config.mjs` modules
for example configurations.

Then, in `package.json`, we can use `ses-ava` instead of `ava`.

```json
{
  "scripts": {
    "test": "ses-ava",
    "test:c8": "c8 ${C8_OPTIONS:-} ses-ava"
  },
  "avaConfigs": {
    "lockdown": "test/_ava-lockdown.config.mjs",
    "unsafe": "test/_ava-lockdown-unsafe.config.mjs",
  }
}
```

With this configuration, `ses-ava ...args --exclude lockdown` and `ses-ava
...args --only unsafe` would both just run the `unsafe` configuration.
Using `ses-ava` under `c8` allows all configurations to cover used code.

# Compatibility

If you were already using `@endo/ses-ava` by doing

```js
import 'ses'; // or however you initialize the SES-shim
import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

const test = wrapTest(rawTest);
```

that code will continue to work. But it should be upgraded to the above
pattern if possible.
