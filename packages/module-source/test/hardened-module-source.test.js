import test from '@endo/ses-ava/test.js';

import { ModuleSource } from '../src/module-source.js';

const assertModuleSourceHardened = (t, record) => {
  t.true(
    Object.isFrozen(ModuleSource),
    'ModuleSource constructor should be frozen',
  );
  t.true(
    Object.isFrozen(ModuleSource.prototype),
    'ModuleSource prototype should be frozen',
  );
  t.true(Object.isFrozen(record), 'ModuleSource instance should be frozen');
  t.true(
    // eslint-disable-next-line no-underscore-dangle
    Object.isFrozen(record.__liveExportMap__),
    'ModuleSource live export map should be frozen',
  );
  t.true(
    // eslint-disable-next-line no-underscore-dangle
    Object.isFrozen(record.__reexportMap__),
    'ModuleSource reexport map should be frozen',
  );
  t.true(
    // eslint-disable-next-line no-underscore-dangle
    Object.isFrozen(record.__fixedExportMap__),
    'ModuleSource fixed export map should be frozen',
  );
};

test('ModuleSource transitively frozen', t => {
  const record = new ModuleSource('export default 1;');
  assertModuleSourceHardened(t, record);
});
