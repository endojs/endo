/* eslint-disable no-template-curly-in-string */
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

test('evadeCensor() - regexp with all evasion patterns', async t => {
  const { code } = evadeCensorSync(`const re = /import ([a-z]*)|<!--|-->/g;`, {
    sourceType: 'module',
  });

  t.log(code);
  t.true(code.includes('\\x69')); // 'i' escaped
  t.true(code.includes('\\x3C')); // '<' escaped
  t.true(code.includes('\\x2D')); // '-' escaped

  // eslint-disable-next-line no-new-func
  const re = new Function(`${code};return re;`)();
  t.deepEqual('import name'.match(re), ['import name']);
  t.deepEqual('<!--'.match(re), ['<!--']);
  t.deepEqual('-->'.match(re), ['-->']);
  t.deepEqual('import name <!-- -->'.match(re), ['import name', '<!--', '-->']);
});

test('evadeCensor() - regexp with multiple occurrences of the same pattern', async t => {
  const { code } = evadeCensorSync(`const re = /<!--.*<!--/g;`, {
    sourceType: 'module',
  });

  t.is((code.match(/\\x3C/g) || []).length, 2);

  // eslint-disable-next-line no-new-func
  const re = new Function(`${code};return re;`)();
  t.deepEqual('<!--a<!--'.match(re), ['<!--a<!--']);
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
    const reHtmlAlike = /<!--.*-->/g;
    
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

test('evadeCensor() - onlyComments skips string and code evasions', async t => {
  const { code } = evadeCensorSync(evadeThat, {
    sourceType: 'module',
    onlyComments: true,
  });

  t.snapshot(code);
});

test('evadeCensor() - templates - template with multiple evasion patterns in single quasi', async t => {
  const { code } = evadeCensorSync(
    'const x = `import("a") and import("b") and <!--comment-->`;',
    { sourceType: 'module' },
  );
  t.is(
    code,
    'const x =`im${""}port("a") and im${""}port("b") and <!${""}--comment--${""}>`;',
  );
});

test('evadeCensor() - templates - template with evasion patterns around expressions', async t => {
  const { code } = evadeCensorSync(
    'const x = `import(${a}) then ${b} import(${c})`',
    { sourceType: 'module' },
  );
  t.is(code, 'const x =`im${""}port(${a}) then ${b} im${""}port(${c})`');
});

test('evadeCensor() - templates - template with evasion pattern split across expression boundary', async t => {
  const { code } = evadeCensorSync(
    'const x = `before import(${expr}) after import( more`',
    { sourceType: 'module' },
  );
  t.is(code, 'const x =`before im${""}port(${expr}) after im${""}port( more`');
});

test('evadeCensor() - templates - template with HTML comment patterns', async t => {
  const { code } = evadeCensorSync(
    'const x = `<!-- start --> middle <!-- end -->`',
    { sourceType: 'module' },
  );
  t.is(
    code,
    'const x =`<!${""}-- start --${""}> middle <!${""}-- end --${""}>`',
  );
});

test('evadeCensor() - templates - nested template literals', async t => {
  const { code } = evadeCensorSync(
    'const x = `outer import(${`inner import(`})`',
    { sourceType: 'module' },
  );
  t.is(code, 'const x =`outer im${""}port(${`inner im${""}port(`})`');
});

test('evadeCensor() - templates - tagged template is NOT transformed', async t => {
  const { code } = evadeCensorSync(
    'const x = html`<script>import("dangerous")</script>`',
    { sourceType: 'module' },
  );
  // Should NOT contain empty string expressions breaking the pattern
  t.true(code.includes('import('));
  t.is(code, 'const x = html`<script>import("dangerous")</script>`');
});

test('evadeCensor() - templates - template with only safe content unchanged', async t => {
  const { code } = evadeCensorSync('const x = `just some ${normal} template`', {
    sourceType: 'module',
  });
  t.is(code, 'const x = `just some ${normal} template`');
});

test('evadeCensor() - templates - template with consecutive evasion patterns', async t => {
  const { code } = evadeCensorSync('const x = `import(import(import(`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`im${""}port(im${""}port(im${""}port(`');
});

test('evadeCensor() - templates - template mixing all evasion types', async t => {
  const { code } = evadeCensorSync('const x = `<!--import(-->import(<!--`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`<!${""}--im${""}port(--${""}>im${""}port(<!${""}--`');
});

test('evadeCensor() - templates - multiple templates in sequence', async t => {
  // Tests that lastIndex is properly reset between different template literals
  const { code } = evadeCensorSync(
    'const a = `import(`; const b = `import(`;',
    { sourceType: 'module' },
  );
  t.is(code, 'const a =`im${""}port(`;const b=`im${""}port(`;');
});

test('evadeCensor() - templates - pattern at very end of quasi', async t => {
  const { code } = evadeCensorSync('const x = `text import(`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`text im${""}port(`');
});

test('evadeCensor() - templates - pattern at very start of quasi', async t => {
  const { code } = evadeCensorSync('const x = `import( text`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`im${""}port( text`');
});

test('evadeCensor() - templates - empty quasi between patterns', async t => {
  const { code } = evadeCensorSync('const x = `import(${x}import(`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`im${""}port(${x}im${""}port(`');
});

test('evadeCensor() - templates - pattern spans quasi boundary (should not match)', async t => {
  // "im" in first quasi, "port(" in second - should NOT be transformed as a unit
  const { code } = evadeCensorSync('const x = `im${x}port(`', {
    sourceType: 'module',
  });
  // Neither quasi contains the full pattern, so no transformation
  t.is(code, 'const x = `im${x}port(`');
});

test('evadeCensor() - templates - only first quasi has pattern', async t => {
  const { code } = evadeCensorSync('const x = `import(${a}safe text`', {
    sourceType: 'module',
  });
  t.is(code, 'const x =`im${""}port(${a}safe text`');
});

test('evadeCensor() - templates - only last quasi has pattern', async t => {
  const { code } = evadeCensorSync('const x = `safe text ${a}import(`', {
    sourceType: 'module',
  });
  // If the tests fails because updated babel stopped adding a space it's fine.
  // Looks like a babel glitch -----v
  t.is(code, 'const x =`safe text ${ a}im${""}port(`');
});
