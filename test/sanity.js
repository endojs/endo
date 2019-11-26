import { test } from 'tape-promise/tape';
import bundleSource from '..';

test('sanity', async t => {
  try {
    const { moduleFormat: mf1, source: src1 } = await bundleSource(`${__dirname}/../demo/dir1`);
    t.equal(mf1, 'getExport', 'module format is getExport');
    t.assert(src1.match(/require\('@agoric\/harden'\)/), 'harden is required');
    const { moduleFormat: mf2, source: src2 } = await bundleSource(`${__dirname}/../demo/dir1/encourage.js`);
    t.equal(mf2, 'getExport', 'module format 2 is getExport');
    const ex2 = eval(`(${src2}\n)()`);
    t.equal(ex2.message, `You're great!`, 'exported message matches');
    t.equal(ex2.encourage('Nick'), `Hey Nick!  You're great!`, 'exported encourage matches');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
