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
    t.equal(
      resolve('.', 'file:///some/where/over/'),
      'file:///some/where/over/',
      'dot preserves slash',
    );
    t.equal(
      resolve('.', referrer),
      'file:///some/where/over/rainbow/',
      'dot keeps slash',
    );
    t.equal(
      resolve('./foo/', referrer),
      'file:///some/where/over/rainbow/foo/',
      'explicit directory keeps slash',
    );
    t.equal(
      resolve('./foo/.', referrer),
      'file:///some/where/over/rainbow/foo/',
      'trailing dot keeps slash',
    );
    t.equal(
      resolve('..', `${referrer}/bar`),
      'file:///some/where/over/rainbow/',
      'two dots keeps slash',
    );
    t.equal(
      resolve('./foo/..', referrer),
      'file:///some/where/over/rainbow/',
      'trailing two dots keep slash',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
