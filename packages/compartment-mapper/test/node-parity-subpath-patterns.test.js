/**
 * Node.js parity test for subpath pattern replacement.
 *
 * This test runs the fixtures under plain Node.js to verify they are valid
 * Node.js packages. The same expected values are asserted in the Compartment
 * Mapper test (subpath-patterns.test.js), so parity is verified by
 * construction: if both tests pass, the behaviors are equivalent.
 */
import test from 'ava';

const fixtureBase = new URL(
  'fixtures-subpath-patterns/node_modules/app/',
  import.meta.url,
);

test('subpath patterns - node parity', async t => {
  const ns = await import(new URL('main.js', fixtureBase).href);
  t.like(ns, {
    alpha: 'alpha',
    betaGamma: 'beta-gamma',
    exact: 'exact-match',
    helper: 'helper',
    specificity: 'specific',
  });
});

test('multi-star patterns are not resolved by Node.js', async t => {
  // Node.js restricts subpath patterns to exactly one `*` per side.
  // Entries with multiple `*` are silently ignored (never match).
  // This test will fail if Node.js begins to support multi-star patterns,
  // signaling that we should revisit our implementation.
  const fixtureDir = new URL(
    'fixtures-subpath-patterns/node_modules/',
    import.meta.url,
  );
  // The main export (no wildcards) should still work.
  const main = await import(
    new URL('multi-star-lib/src/main.js', fixtureDir).href
  );
  t.is(main.main, 'main');

  // The multi-star subpath pattern should NOT resolve.
  await t.throwsAsync(
    () => import(new URL('app/multi-star-import.js', fixtureDir).href),
    {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    },
  );
});

test('globstar patterns are not resolved by Node.js', async t => {
  // Node.js does not support globstar (**) in subpath patterns.
  // Entries with ** are silently ignored (never match).
  // This test will fail if Node.js begins to support globstar patterns,
  // signaling that we should revisit our implementation.
  const fixtureDir = new URL(
    'fixtures-subpath-patterns/node_modules/',
    import.meta.url,
  );
  // The main export (no wildcards) should still work.
  const main = await import(
    new URL('globstar-lib/src/main.js', fixtureDir).href
  );
  t.is(main.main, 'main');

  // The globstar subpath pattern should NOT resolve.
  await t.throwsAsync(
    () => import(new URL('app/globstar-import.js', fixtureDir).href),
    {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    },
  );
});
