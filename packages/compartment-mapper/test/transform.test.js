// import "./ses-lockdown.js";
import 'ses';
import fs from 'fs';
import test from 'ava';
import url from 'url';
import { loadLocation } from '../src/import.js';
import { makeArchive } from '../src/archive.js';
import { parseArchive } from '../src/import-archive.js';
import { makeReadPowers } from '../src/node-powers.js';

// @ts-expect-error XXX Node interface munging
const readPowers = makeReadPowers({ fs, url });
const { read } = readPowers;

test('transforms applied to evaluation', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-0/node_modules/evaluator/evaluator.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.import({
    globals: {
      code: '"hello"',
    },
    transforms: [
      function transform(source) {
        return source.replace(/ll/g, 'y');
      },
    ],
  });
  const { default: value } = namespace;
  t.is(value, 'heyo', 'code evaluated in compartment is transforemd');
});

test('transforms applied to evaluation of archives', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-0/node_modules/evaluator/evaluator.js',
    import.meta.url,
  ).toString();

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive, fixture);
  const { namespace } = await application.import({
    globals: {
      code: '"hello"',
    },
    transforms: [
      function transform(source) {
        return source.replace(/ll/g, 'y');
      },
    ],
  });
  const { default: value } = namespace;
  t.is(value, 'heyo', 'code evaluated in compartment is transforemd');
});

test('module transforms applied while importing from file system', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-0/node_modules/avery/avery.js',
    import.meta.url,
  ).toString();

  const application = await loadLocation(read, fixture, {
    moduleTransforms: {
      async mjs(sourceBytes) {
        const source = new TextDecoder().decode(sourceBytes);
        const object = source.toLowerCase();
        const objectBytes = new TextEncoder().encode(object);
        return { bytes: objectBytes, parser: 'mjs' };
      },
    },
  });
  const { namespace } = await application.import();
  const { avery } = namespace;
  // avery was Avery in the source
  t.is(avery, 'avery', 'code entering archive is transformed');
});

test('module transforms applied while constructing archives', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-0/node_modules/avery/avery.js',
    import.meta.url,
  ).toString();

  const archive = await makeArchive(read, fixture, {
    moduleTransforms: {
      async mjs(sourceBytes) {
        const source = new TextDecoder().decode(sourceBytes);
        const object = source.toLowerCase();
        const objectBytes = new TextEncoder().encode(object);
        return { bytes: objectBytes, parser: 'mjs' };
      },
    },
  });
  const application = await parseArchive(archive, fixture);
  const { namespace } = await application.import();
  const { avery } = namespace;
  // avery was Avery in the source
  t.is(avery, 'avery', 'code entering archive is transformed');
});

test('module transforms apply only to the intended language', async t => {
  t.plan(1);

  const fixture = new URL(
    'fixtures-0/node_modules/avery/avery.js',
    import.meta.url,
  ).toString();

  const archive = await makeArchive(read, fixture, {
    moduleTransforms: {
      async json() {
        // Erase JSON modules. (There are no JSON modules.)
        t.fail();
        const objectBytes = new Uint8Array();
        return { bytes: objectBytes, parser: 'mjs' };
      },
    },
  });
  const application = await parseArchive(archive, fixture);
  const { namespace } = await application.import();
  const { avery } = namespace;
  t.is(avery, 'Avery', 'non-JSON module is not transformed');
});

test('module transforms can be used to translate JSON to JS', async t => {
  t.plan(2);

  const fixture = new URL(
    'fixtures-0/node_modules/typeparsers/json.json',
    import.meta.url,
  ).toString();

  const archive = await makeArchive(read, fixture, {
    moduleTransforms: {
      async json(sourceBytes) {
        t.is(1, 1); // plan + 1
        const source = new TextDecoder().decode(sourceBytes);
        const object = `export default ${source.trim()};\n`;
        const objectBytes = new TextEncoder().encode(object);
        return { bytes: objectBytes, parser: 'mjs' };
      },
    },
  });
  const application = await parseArchive(archive, fixture);
  const { namespace } = await application.import();
  const { default: value } = namespace;
  t.is(value, 42, 'JSON module transformed');
});

test('module transforms can be used for extensions where the language is not known', async t => {
  t.plan(2);

  const fixture = new URL(
    'fixtures-0/node_modules/language-unknown/main.xyz',
    import.meta.url,
  ).toString();

  const archive = await makeArchive(read, fixture, {
    moduleTransforms: {
      xyz: async sourceBytes => {
        t.is(1, 1); // plan + 1
        const source = new TextDecoder().decode(sourceBytes);
        const output = source
          .replace('!! ', '// ')
          .replace('provide ', 'export default ')
          .replace('lambda(', '(')
          .replace('): ', ') => ')
          .replace(' add ', ' + ');
        const objectBytes = new TextEncoder().encode(output);
        return { bytes: objectBytes, parser: 'mjs' };
      },
    },
  });
  const application = await parseArchive(archive, fixture);
  const { namespace } = await application.import();
  const { default: addFn } = namespace;
  const value = addFn(40, 2);
  t.is(value, 42, 'unknown language module transformed');
});
