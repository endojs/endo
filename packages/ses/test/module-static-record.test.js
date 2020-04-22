import tap from 'tap';
import { ModuleStaticRecord } from '../src/main.js';

const { test } = tap;

test('module static record constructor', t => {
  const msr = new ModuleStaticRecord(`
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

  t.equal(
    '[object ModuleStaticRecord]',
    msr.toString(),
    'instance string representation should be fixed',
  );
  t.equal(
    'function ModuleStaticRecord() { [shim code] }',
    ModuleStaticRecord.toString(),
    'constructor string representation should be fixed',
  );

  t.deepEquals(
    msr.imports,
    [
      'import-all-from-me.js',
      'import-and-export-all.js',
      'import-and-reexport-name-from-me.js',
      'import-default-export-from-me.js',
      'import-named-export-and-rename.js',
      'import-named-exports-from-me.js',
    ],
    'should capture sorted unique imports',
  );

  t.ok(Object.isFrozen(msr), 'ModuleStaticRecords should be frozen');
  t.ok(
    Object.isFrozen(msr.imports),
    'ModuleStaticRecord imports should be frozen',
  );

  t.end();
});
