import test from 'ava';
import { StaticModuleRecord } from './static-module-record.js';

test('static module record constructor', t => {
  t.plan(1);

  const smr = new StaticModuleRecord('export default 10');
  t.deepEqual(smr.imports, []);
});

test('static module record constructor without new', t => {
  t.plan(1);

  const smr = StaticModuleRecord('export default 10');
  t.deepEqual(smr.imports, []);
});

test('module imports list', t => {
  t.plan(1);

  const smr = new StaticModuleRecord(`
    import namedExport from 'namedModule';
    import otherName from 'namedModule';
    import yetAnother from 'otherModule';
  `);
  t.deepEqual(smr.imports, ['namedModule', 'otherModule']);
});
