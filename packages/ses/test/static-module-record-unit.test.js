import tap from 'tap';
import { StaticModuleRecord } from '../src/module-shim.js';

const { test } = tap;

test('static module record constructor', t => {
  t.plan(1);

  const smr = new StaticModuleRecord('export default 10');
  t.same(smr.imports, []);
});

test('static module record constructor without new', t => {
  t.plan(1);

  const smr = StaticModuleRecord('export default 10');
  t.same(smr.imports, []);
});

test('module imports list', t => {
  t.plan(1);

  const smr = new StaticModuleRecord(`
    import namedExport from 'namedModule';
    import otherName from 'namedModule';
    import yetAnother from 'otherModule';
  `);
  t.same(smr.imports, ['namedModule', 'otherModule']);
});
