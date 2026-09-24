import test from 'ava';

test('shim missing assert utility methods', async t => {
  const namespace = await import('../index.js');
  /** @type {any} */
  const globalAssert = globalThis.assert;
  t.is(namespace.bare, namespace.quote);
  t.is(namespace.makeError, globalAssert.error);
});
