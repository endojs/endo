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

test('evadeCensor() - transformed regexp works', async t => {
  const { code } = evadeCensorSync(
    `const a = /[import (]+/g;
     const b = /import (.*)/gi;`,
    {
      sourceType: 'module',
    },
  );
  // eslint-disable-next-line no-new-func
  const [regA, regB] = new Function(`${code};return [a,b];`)();
  t.true(regA.test('qiopz'));
  t.true(regB.test('import a from b'));
});

// import in a string will triger censorship in SES
const evadeThat = `
    // HTML comment <!-- should be evaded -->
    var HTMLstring = '<!-- should be evaded -->';
    var HTMLtString = \`<!-- should be evaded -->\`;
    // import comment ...import('some-module');
    const result = eval("...import('some-module'); await import(\\"other\\");");
    const result2 = eval('...import(\\'some-module\\'); await import("other");');
    const multilineimport = \`
        console.log(\${a})
        await import('some-module');
        console.log(\${b})
    \`;
    
    const taggedtemplate = String.dedent\`
        await import('some-module');
    \`;

    const re = /import (.*)/g;
    
    import("some-module");
    if (a--> b) {}
  `;

test('evadeCensor() - actual evasions in ESM', async t => {
  const { code } = evadeCensorSync(evadeThat, {
    sourceType: 'module',
  });

  t.snapshot(code);
});

test('evadeCensor() - actual evasions in ESM + elide', async t => {
  const { code } = evadeCensorSync(evadeThat, {
    sourceType: 'module',
    elideComments: true,
  });

  t.snapshot(code);
});

test('evadeCensor() - noCodeTransforms skips string and code evasions', async t => {
  const { code } = evadeCensorSync(evadeThat, {
    sourceType: 'module',
    noCodeTransforms: true,
  });

  t.snapshot(code);
});
