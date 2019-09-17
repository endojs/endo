/* eslint-disable import/no-extraneous-dependencies */
import { test } from 'tape-promise/tape';

import { makeTransformRewriter } from '../src';

test('transform rewriter', async t => {
  try {
    const boxedTransform = [];
    const rewrite = makeTransformRewriter(boxedTransform);
    boxedTransform[0] = {
      rewrite(rs) {
        t.equal(typeof rewrite, 'function', 'rewrite is a function');
        t.equal(rs.sourceType, 'module', 'sourceType is a module');
        rs.endowments.hImport = async mod => `imported:${mod}`;
        rs.src = rs.src.replace(/import/g, 'hImport');
        return rs;
      },
    };
    const rs = rewrite(`import('foo')`, '@example/foo');
    t.equal(
      await rs.endowments.hImport('something'),
      'imported:something',
      `endowments work`,
    );
    t.equal(rs.src, `hImport('foo')`, 'rewrite works');
    // eslint-disable-next-line no-eval
    const ret = (1, eval)(`({ hImport }) => (${rs.src}\n)`)(rs.endowments);
    t.equal(await ret, `imported:foo`, `combination works`);
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
