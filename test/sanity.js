import { test } from 'tape-promise/tape';
import bundleSource from '..';

test('sanity', async t => {
  try {
    const {
      moduleFormat: mf1,
      source: src1,
      sourceMap: map1,
    } = await bundleSource(`${__dirname}/../demo/dir1`);

    const srcMap1 = `(${src1}\n)()\n${map1}`;

    // console.log(srcMap1);

    t.equal(mf1, 'getExport', 'module format is getExport');
    t.assert(src1.match(/require\('@agoric\/harden'\)/), 'harden is required');

    // eslint-disable-next-line no-eval
    const ex1 = (1, eval)(`function require() { return o => o };${srcMap1}`);

    const bundle = ex1.default();
    const err = bundle.makeError('foo');
    t.assert(
      err.stack.indexOf('(file:///bundle-source/getExport/encourage.js:') >= 0,
      'bundled source is in stack trace',
    );

    const {
      moduleFormat: mf2,
      source: src2,
      sourceMap: map2,
    } = await bundleSource(`${__dirname}/../demo/dir1/encourage.js`);
    t.equal(mf2, 'getExport', 'module format 2 is getExport');

    const srcMap2 = `(${src2}\n)()\n${map2}`;

    // eslint-disable-next-line no-eval
    const ex2 = (1, eval)(srcMap2);
    t.equal(ex2.message, `You're great!`, 'exported message matches');
    t.equal(
      ex2.encourage('Nick'),
      `Hey Nick!  You're great!`,
      'exported encourage matches',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
