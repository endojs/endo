import test from 'ava';

// I don't think we care anymore about SES v0.18.3
test.skip('shim bare on ses 0.18.3', async t => {
  // SES v0.18.3 predates the `bare` export.
  const namespace = await import('../index.js');
  t.is(namespace.bare, namespace.quote);
});
