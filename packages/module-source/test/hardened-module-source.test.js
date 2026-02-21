import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import hardenIsNoop from '@endo/harden/is-noop.js';

import { ModuleSource } from '../src/module-source.js';

const lockedDown = Object.isFrozen(Object);
const noopHarden = hardenIsNoop(harden);

const testWithLockdown = lockedDown ? test : test.skip;
const testWithoutLockdown = lockedDown ? test.skip : test;

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
    Object.isFrozen(record.__liveExportMap__),
    'ModuleSource live export map should be frozen',
  );
  t.true(
    Object.isFrozen(record.__reexportMap__),
    'ModuleSource reexport map should be frozen',
  );
  t.true(
    Object.isFrozen(record.__fixedExportMap__),
    'ModuleSource fixed export map should be frozen',
  );
};

const assertModuleSourceMutable = (t, record) => {
  record.extra = 1;
  t.is(record.extra, 1, 'ModuleSource instance allows new properties');
  ModuleSource.extra = 2;
  t.is(ModuleSource.extra, 2, 'ModuleSource constructor allows new properties');
  ModuleSource.prototype.extra = 3;
  t.is(
    ModuleSource.prototype.extra,
    3,
    'ModuleSource prototype allows new properties',
  );
};

testWithoutLockdown('ModuleSource hardens before lockdown', t => {
  t.false(lockedDown, 'expected no lockdown in this config');
  const record = new ModuleSource('export default 1;');
  if (noopHarden) {
    assertModuleSourceMutable(t, record);
  } else {
    assertModuleSourceHardened(t, record);
  }
});

testWithLockdown('ModuleSource hardens after lockdown', t => {
  t.true(lockedDown, 'expected lockdown in this config');
  const record = new ModuleSource('export default 1;');
  assertModuleSourceHardened(t, record);
});
