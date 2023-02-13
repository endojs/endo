# Endo Exec

Importing `endo-exec` declares that if module executed directly as a script, it
will run in a Hardened JS start compartment.  It opts for compatibility with
legacy code when possible.

NOTE: if you want precise control over how Endo is initialized, especially if
you are writing an application that needs to use mixed Compartments (both
trusted libraries and untrusted code), you should NOT use this package.
Instead, have a look at `@endo/init`.

Import `endo-exec` like:

```js
#! /usr/bin/env node
import 'endo-exec';

console.log('Hello, Endo world!');

Object.prototype.monkeyPatch = 53;
// (TypeError#1)
// TypeError#1: Cannot add property monkeyPatch, object is not extensible
//  at main (file:///Users/michael/agoric/endo/packages/syrup/a.js:6:32)
//  at /Users/michael/agoric/endo/packages/endo-exec/endo-exec.cjs:22:15
```

Or if you want to have your script be importable without side-effects (ocap
discipline), then avoid top-level module state and export a `main` entrypoint
that can be executed on demand.

```js
#! /usr/bin/env node
import 'endo-exec';

import { promises as fs } from 'fs';

/** @type {import('endo-exec').Main} */ 
export const main = async ([script, file]) => {
  console.log('Hello from', script);
  await fs.readFile(file);
  console.log(`Here's the file`, file);
};
```
