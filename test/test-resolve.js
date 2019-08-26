import { test } from 'tape-promise/tape';

import { makeRootedResolver } from '../src';

test('rooted resolve', async t => {
  try {
    const resolve = makeRootedResolver('file:///some/where/over');
    const referrer = 'file:///some/where/over/rainbow/place.js';
    t.equal(
      resolve('./foo', referrer),
      'file:///some/where/over/rainbow/foo',
      'can use dot',
    );
    t.equal(
      resolve('../root.js', referrer),
      'file:///some/where/over/root.js',
      'can use dotdot',
    );
    t.throws(
      () => resolve('./foo/../../../superroot.js', referrer),
      TypeError,
      `cannot skip root`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
