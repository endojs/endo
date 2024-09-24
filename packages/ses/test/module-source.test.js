/// <reference types="ses">

import test from 'ava';
import '../index.js';
import '@endo/module-source/shim.js';

lockdown();

test('module source constructor', t => {
  const msr = new ModuleSource(`
    import foo from 'import-default-export-from-me.js';
    import oof from 'import-default-export-from-me.js';
    import * as bar from 'import-all-from-me.js';
    import { fizz, buzz } from 'import-named-exports-from-me.js';
    import { color as colour } from 'import-named-export-and-rename.js';

    export let quuux = null;

    export { qux } from 'import-and-reexport-name-from-me.js';
    export * from 'import-and-export-all.js';
    export default 42;
    export const quux = 'Hello, World!';

    // Late binding of an exported variable.
    quuux = 'Hello, World!';
  `);

  t.deepEqual(
    msr.imports,
    [
      'import-default-export-from-me.js',
      'import-all-from-me.js',
      'import-named-exports-from-me.js',
      'import-named-export-and-rename.js',
      'import-and-reexport-name-from-me.js',
      'import-and-export-all.js',
    ],
    'should capture sorted unique imports',
  );

  t.truthy(Object.isFrozen(msr), 'ModuleSources should be frozen');
  t.truthy(
    Object.isFrozen(msr.imports),
    'ModuleSource imports should be frozen',
  );
});
