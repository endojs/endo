/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'tape-promise/tape';

import { makeTypeAnalyzer } from '../src';

test('type analyzer', async t => {
  try {
    const imports = Object.create(null);
    const liveExportMap = Object.create(null);
    const fixedExportMap = Object.create(null);
    const exportAlls = [];
    const moduleAnalyzer = ({ string }) => {
      const functorSource = string.replace(/import/g, 'hImport');
      return {
        imports,
        liveExportMap,
        fixedExportMap,
        exportAlls,
        functorSource,
      };
    };
    const analyze = makeTypeAnalyzer({ module: moduleAnalyzer });
    await t.rejects(analyze('foo'), TypeError, 'missing type rejects');
    await t.rejects(
      analyze({ type: 'unknown' }),
      TypeError,
      'unknown type rejects',
    );
    const moduleStaticRecord = await analyze({
      string: `import('foo')`,
      type: 'module',
    });
    t.deepEqual(
      moduleStaticRecord,
      {
        functorSource: `hImport('foo')`,
        exportAlls,
        fixedExportMap,
        liveExportMap,
        imports,
      },
      `analyze works`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
