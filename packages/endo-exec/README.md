# Endo Exec

Importing `endo-exec` declares that if module executed directly as a script, it
will run in a Hardened JS start compartment.  It opts for compatibility with
legacy code (via `@endo/init/legacy.js`) when possible.

Import `endo-exec` like:

```js
#! /usr/bin/env node
import 'endo-exec';

console.log('Hello, Endo world!');

Object.prototype.monkeyPatch = 53;
// (TypeError#1)
// TypeError#1: Cannot add property monkeyPatch, object is not extensible
//  at main (.../endo/packages/endo-exec/scripts/ex1.js:6:32)
//  at .../endo/packages/endo-exec/endo-exec.cjs:22:15
```

Or if you want to have your script be importable without side-effects (ocap
discipline), then avoid top-level module side-effects and state and export an
`onEndoExec` entrypoint that will only be called if the script was run directly.

```js
#! /usr/bin/env node
import 'endo-exec';

import { promises as fs } from 'fs';

export const greetingFrom = self => console.log('Hello from', self);
export const hereItIs = `Here's the file`;

/** @type {import('endo-exec').OnEndoExec} */ 
export const onEndoExec = async ({ process: { argv: [script, file] }}) => {
  greetingFrom(script);
  await fs.readFile(file);
  console.log(hereItIs, file);
};
```
