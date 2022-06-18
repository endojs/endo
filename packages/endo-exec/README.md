# Endo Exec

The Endo executor is a helper for creating scripts that are executed in a Hardened JS start compartment.  It opts for compatibility with legacy code when possible.

NOTE: if you want control over how Endo is initialized, especially if you are
writing an application that needs to use mixed Compartments (both trusted
libraries and untrusted code), you should NOT use this package.

Use it like:

```js
#! /usr/bin/env endo-exec
console.log('Hello, Endo world!');
```

Or if you want to have your script be importable without side-effects (ocap
discipline), then avoid top-level module state and export a `main` entrypoint
that can be executed on demand.

```js
#! /usr/bin/env endo-exec
import { promises as fs } from 'fs';

/** @type {import('endo-exec').Main} */ 
export const main = async ([script, file]) => {
  console.log('Hello from', script);
  await fs.readFile(file);
  console.log(`Here's the file`, file);
};
```
