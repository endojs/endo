import test from 'ava';

import { makeRootedResolver } from '../src/main';

test('rooted resolve', async t => {
  try {
    const resolve = makeRootedResolver('file:///some/where/over');
    const referrer = 'file:///some/where/over/rainbow/place.js';
    t.is(
      resolve('./foo', referrer),
      'file:///some/where/over/rainbow/foo',
      'can use dot',
    );
    t.is(
      resolve('../root.js', referrer),
      'file:///some/where/over/root.js',
      'can use dotdot',
    );
    t.throws(
      () => resolve('./foo/../../../superroot.js', referrer),
      { instanceOf: TypeError },
      `cannot skip root`,
    );
    t.is(
      resolve('.', 'file:///some/where/over/'),
      'file:///some/where/over/',
      'dot preserves slash',
    );
    t.is(
      resolve('.', referrer),
      'file:///some/where/over/rainbow/',
      'dot keeps slash',
    );
    t.is(
      resolve('./foo/', referrer),
      'file:///some/where/over/rainbow/foo/',
      'explicit directory keeps slash',
    );
    t.is(
      resolve('./foo/.', referrer),
      'file:///some/where/over/rainbow/foo/',
      'trailing dot keeps slash',
    );
    t.is(
      resolve('..', `${referrer}/bar`),
      'file:///some/where/over/rainbow/',
      'two dots keeps slash',
    );
    t.is(
      resolve('./foo/..', referrer),
      'file:///some/where/over/rainbow/',
      'trailing two dots keep slash',
    );
  } catch (e) {
    t.not(e, e, 'unexpected exception');
  } finally {
  }
});
