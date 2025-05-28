// @ts-nocheck
import { evadeCensorSync } from '../src/index.js';
import { test } from './_prepare-test-env-ava-fixture.js';

/**
 * Removes all linefeeds from string
 *
 * Used to normalize snapshots across platforms
 *
 * @param {string} str
 * @returns {string}
 */
function stripLinefeeds(str) {
  return str.replace(/\r?\n|\r/g, '');
}

test('evadeCensor() - missing "source" arg', async t => {
  // @ts-expect-error - intentional missing args
  t.throws(evadeCensorSync);
});

test('evadeCensor() - successful source transform', async t => {
  const { source } = t.context;
  const { code, map } = evadeCensorSync(source, { sourceType: 'script' });

  t.snapshot(stripLinefeeds(code));
  t.is(map, undefined);
});

test('evadeCensor() - disallowed return outside function in w/ non-script source type', async t => {
  const { source } = t.context;
  t.throws(() => evadeCensorSync(source), {
    instanceOf: SyntaxError,
    message: /'return' outside of function/,
  });
});

test('evadeCensor() - successful source transform w/ source map', async t => {
  const { source, sourceMap } = t.context;
  const { code, map } = evadeCensorSync(source, {
    sourceMap,
    sourceType: 'script',
  });

  t.snapshot(stripLinefeeds(code));
  t.is(map, undefined);
});

test('evadeCensor() - successful source transform w/ source map & source URL', async t => {
  const { sourceMap, sourceUrl, source } = t.context;
  const { code, map } = evadeCensorSync(source, {
    sourceMap,
    sourceUrl,
    sourceType: 'script',
  });

  t.snapshot(stripLinefeeds(code));
  t.snapshot(map);
});

test('evadeCensor() - successful source transform w/ source URL', async t => {
  const { sourceUrl, source } = t.context;
  const { code, map } = evadeCensorSync(source, {
    sourceUrl,
    sourceType: 'script',
  });

  t.snapshot(stripLinefeeds(code));
  t.snapshot(map);
});

test('evadeCensor() - successful source transform w/ source map & unmapping', async t => {
  const { sourceMap, source } = t.context;
  const { code, map } = evadeCensorSync(source, {
    sourceMap,
    sourceType: 'script',
  });

  t.snapshot(stripLinefeeds(code));
  t.is(map, undefined);
});

test('evadeCensor() - successful source transform w/ source map, source URL & unmapping', async t => {
  const { sourceMap, sourceUrl, source } = t.context;
  const { code, map } = evadeCensorSync(source, {
    sourceMap,
    sourceUrl,
    sourceType: 'script',
  });

  t.snapshot(stripLinefeeds(code));
  t.snapshot(map);
});
