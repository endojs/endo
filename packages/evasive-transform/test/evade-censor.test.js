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

test('evadeCensor() - fast path for source without comment markers', async t => {
  const source = `const answer = 42;\nexport { answer };`;
  const { code, map } = evadeCensorSync(source, { sourceType: 'module' });
  t.is(code, source);
  t.is(map, undefined);
});

test('evadeCensor() - fast path returns source map when sourceUrl is provided', async t => {
  const source = `const answer = 42;\nexport { answer };`;
  const sourceUrl = 'fast-path.js';
  const { code, map } = evadeCensorSync(source, {
    sourceType: 'module',
    sourceUrl,
  });
  t.is(code, source);
  t.truthy(map);
  t.deepEqual(map.sources, [sourceUrl]);
});

test('evadeCensor() - fast path can skip despite ordinary comments', async t => {
  const source = `// hello\nconst answer = 42; /* ordinary */\nexport { answer };`;
  const { code, map } = evadeCensorSync(source, { sourceType: 'module' });
  t.is(code, source);
  t.is(map, undefined);
});

test('evadeCensor() - elideComments still forces transform on fast-path source', async t => {
  const source = `// hello\nconst answer = 42;\nexport { answer };`;
  const { code } = evadeCensorSync(source, {
    sourceType: 'module',
    elideComments: true,
  });
  t.not(code, source);
});
