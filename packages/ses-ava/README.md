# `@endo/ses-ava`

*SES-Ava* wraps Ava `test` functions and initializes the SES-shim with options
suitable for debugging tests. This includes logging errors to the console with
- deep stacks of prior turns
- unredacted stack traces
- unredacted error messages

To use this module, in your Ava test files, replace

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
specifically to "devDependencies". @endo/ses-ava itself depends on Ava as
a regular dependency, so it you include @endo/ses-ava as a regular
dependency, bundlers might bundle your code with all of Ava.

SES-Ava rhymes with Nineveh.

# SES and no-SES configurations

With an appropriate pair of Ava configurations, packages can run the same tests
with or without an initialized Endo environment.
This is useful for packages that can be used with or without Endo and need to
cover both configurations in their tests.
To achieve this, `ses-ava` exports two additional modules:
`@endo/ses-ava/test.js` and `@endo/ses-ava/prepare-endo-config.js`.
The package-under-test can use separate scripts in `package.json` for SES and
no-SES tests:

```json
{
  "scripts": {
    "test": "yarn test:ses && yarn test:noses",
    "test:ses": "ava --config test/_ava-ses.config.js",
    "test:noses": "ava --config test/_ava-noses.config.js"
  }
}
```

The contents of `test/_ava-ses.config.js` pull in the new prepare Endo
configuration module.
The only difference between `@endo/ses-ava/prepare-endo.js` and
`@endo/ses-ava/prepare-endo-config.js` is that the latter does not export a
`default`.
Ava expects the `default` function exported by these modules to have a
different behavior, so we must mask our `test` function.

```js
export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
};
```

The contents of `test/_ava-noses.config.js`, for example, might be:

```js
export default {
  // Shims for a non-lockdown environment
  require: [
    // We initialize SES here without lockdown in order to receive the
    // effects of the immutable-arraybuffer and assert shims.
    'ses',
    // For HandledPromise
    '@endo/eventual-send/shim.js',
  ],
};
```

Ideally the package would, or will in time, depend on no shims.

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
