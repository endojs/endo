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

## Compat note

If you were already using `@endo/ses-ava` by doing

```js
import 'ses'; // or however you initialize the SES-shim
import rawTest from 'ava';
import { wrapTest } from '@endo/ses-ava';

const test = wrapTest(rawTest);
```

that code will continue to work. But it should be upgraded to the above
pattern if possible.
