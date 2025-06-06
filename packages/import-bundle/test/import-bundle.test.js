import test from '@endo/ses-ava/prepare-endo.js';

import { encodeBase64 } from '@endo/base64';
import fs from 'node:fs';
import url from 'node:url';
import crypto from 'node:crypto';
import { makeArchive } from '@endo/compartment-mapper/archive.js';
import bundleSource from '@endo/bundle-source';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { importBundle, bundleTestExports } from '../src/index.js';

import * as namespace from './_namespace.js';

const { read } = makeReadPowers({ fs, url, crypto });

function transform1(src) {
  return src
    .replace('replaceme', 'substitution')
    .replace('two foot wide', 'sixty feet wide');
}

async function testBundle1(t, b1, mode, ew) {
  const ns1 = await importBundle(b1, { endowments: ew });
  t.is(ns1.f1(1), 2, `ns1.f1 ${mode} ok`);
  t.is(ns1.f2(1), 3, `ns1.f2 ${mode} ok`);

  const endowments = { endow1: 3, ...ew };
  const ns2 = await importBundle(b1, { endowments });
  t.is(ns2.f3(1), 4, `ns2.f1 ${mode} ok`);
  // untransformed
  t.is(ns2.f4('is unreplaced'), 'replaceme is unreplaced', `ns2.f4 ${mode} ok`);
  t.is(
    ns2.f5('the bed'),
    'Mr. Lambert says the bed is two foot wide',
    `ns2.f5 ${mode} ok`,
  );

  const ns3 = await importBundle(b1, {
    endowments,
    transforms: [transform1],
  });
  t.is(ns3.f4('is ok'), 'substitution is ok', `ns3.f4 ${mode} ok`);
  t.is(
    ns3.f5('the bed'),
    'Mr. Lambert says the bed is sixty feet wide',
    `ns3.f5 ${mode} ok`,
  );

  const endowments4 = { sneakyChannel: 3, ...ew };
  const ns4 = await importBundle(b1, { endowments: endowments4 });
  t.is(ns4.f6ReadGlobal(), 3, `ns3.f6 ${mode} ok`);
  t.is(ns4.f6ReadGlobal(), 3, `ns4.f6 ${mode} ok`);
  t.is(ns4.f7ReadGlobalSubmodule(), 3, `ns3.f8 ${mode} ok`);
}

test('test import', async t => {
  await null;
  // nestedEvaluate requires a 'require' endowment, but doesn't call it
  function req(what) {
    console.log(`require(${what})`);
  }
  harden(Object.getPrototypeOf(console));
  const endowments = { require: req, console };

  // bundleSource (in 'getExport' mode) uses rollup() in a way that uses
  // Math.random, which is disabled under SES
  console.log(`TODO: skipping test that needs Math.random`);
  // eslint-disable-next-line no-constant-condition
  if (false) {
    const b1getExport = await bundleSource(
      url.fileURLToPath(new URL('bundle1.js', import.meta.url)),
      'getExport',
    );
    await testBundle1(t, b1getExport, 'getExport', endowments);
  }

  const b1NestedEvaluate = await bundleSource(
    url.fileURLToPath(new URL('bundle1.js', import.meta.url)),
    'nestedEvaluate',
  );
  await testBundle1(t, b1NestedEvaluate, 'nestedEvaluate', endowments);
});

test('test import archive', async t => {
  const endowments = { console };
  const b1EndoZip = await makeArchive(
    read,
    new URL('bundle1.js', import.meta.url).href,
  );
  const b1EndoZipBase64 = encodeBase64(b1EndoZip);
  const b1EndoZipBase64Bundle = {
    moduleFormat: 'endoZipBase64',
    endoZipBase64: b1EndoZipBase64,
  };
  await testBundle1(t, b1EndoZipBase64Bundle, 'endoZipBase64', endowments);
});

test('test fs import with importHook', async t => {
  t.plan(3);
  const testFilePath = url.fileURLToPath(
    new URL('bundle3.js', import.meta.url),
  );
  const fileContents = await fs.promises.readFile(testFilePath, 'utf8');

  const options = {
    moduleFormat: 'endoZipBase64',
    importHook: async specifier => {
      console.log(`importHook(${specifier})`);
      if (specifier === 'fs') {
        t.is(specifier, 'fs');
        return {
          imports: [],
          exports: ['readFileSync'],
          execute: moduleExports => {
            moduleExports.readFileSync = path => {
              if (path === 'self.js') {
                return fileContents;
              }
              throw new Error(`Unknown path: ${path}`);
            };
          },
        };
      }
      return undefined; // Let the archive handle other modules
    },
  };

  // @ts-expect-error no overload matches
  const bundle = await bundleSource(testFilePath, options);
  const ns = await importBundle(bundle, options);

  t.is(
    ns.default.toString(),
    fileContents,
    'should read the file contents correctly',
  );
});

test('test import script', async t => {
  const endowments = { console };
  const b1EndoScriptBundle = await bundleSource(
    url.fileURLToPath(new URL('bundle1.js', import.meta.url)),
    'endoScript',
  );
  await testBundle1(t, b1EndoScriptBundle, 'endoScript', endowments);
});

test('test missing sourceMap', async t => {
  function req(what) {
    console.log(`require(${what})`);
  }
  harden(Object.getPrototypeOf(console));
  const endowments = { require: req, console };

  const b1 = await bundleSource(
    url.fileURLToPath(new URL('bundle1.js', import.meta.url)),
    'nestedEvaluate',
  );
  const { sourceMap: _, ...b2 } = b1;
  const ns1 = await importBundle(b2, { endowments });
  t.is(ns1.f1(1), 2, `missing sourceMap ns.f1 ok`);
});

test('inescapable transforms', async t => {
  const b1 = await bundleSource(
    url.fileURLToPath(new URL('bundle1.js', import.meta.url)),
    'nestedEvaluate',
  );
  function req(what) {
    console.log(`require(${what})`);
  }
  harden(Object.getPrototypeOf(console));
  const endowments = { require: req, console };

  const ns = await importBundle(b1, {
    endowments,
    inescapableTransforms: [transform1],
  });
  t.is(ns.f4('is ok'), 'substitution is ok', `iT ns.f4 ok`);
});

test('inescapable global properties, get export format', async t => {
  const bundle = await bundleSource(
    url.fileURLToPath(new URL('export-inescapable-global.js', import.meta.url)),
    'getExport',
  );

  const ns = await importBundle(bundle, {
    inescapableGlobalProperties: {
      inescapableGlobalValue: 42,
    },
  });
  t.is(ns.default, 42);
});

test('inescapable global properties, nested evaluate format', async t => {
  const bundle = await bundleSource(
    url.fileURLToPath(new URL('export-inescapable-global.js', import.meta.url)),
    'nestedEvaluate',
  );

  const ns = await importBundle(bundle, {
    inescapableGlobalProperties: {
      inescapableGlobalValue: 42,
    },
  });
  t.is(ns.default, 42);
});

test('inescapable global properties, script format', async t => {
  const bundle = await bundleSource(
    url.fileURLToPath(new URL('export-inescapable-global.js', import.meta.url)),
    'endoScript',
  );

  const ns = await importBundle(bundle, {
    inescapableGlobalProperties: {
      inescapableGlobalValue: 42,
    },
  });
  t.is(ns.default, 42);
});

test('inescapable global properties, zip base64 format', async t => {
  const bundle = await bundleSource(
    url.fileURLToPath(new URL('export-inescapable-global.js', import.meta.url)),
    'endoZipBase64',
  );

  const ns = await importBundle(bundle, {
    inescapableGlobalProperties: {
      inescapableGlobalValue: 42,
    },
  });
  t.is(ns.default, 42);
});

test('test the test format', async t => {
  const bundle = /** @type {const} */ ({
    moduleFormat: 'test',
    [Symbol.for('exports')]: {
      z: 43,
      default: 42,
      a: 41,
    },
  });
  const ns = await importBundle(bundle);
  t.is(ns.default, 42);
  t.deepEqual(Object.keys(ns), ['a', 'default', 'z']);
  t.is(Object.prototype.toString.call(ns), '[object Module]');
});

test('test format must not round-trip via JSON', async t => {
  const bundle = JSON.parse(
    JSON.stringify({
      moduleFormat: 'test',
      [Symbol.for('exports')]: {
        default: 42,
      },
    }),
  );
  await t.throwsAsync(importBundle(bundle), {
    message: /Cannot import bundle with moduleFormat "test" that lacks/,
  });
});

test('test bundle utility should fail early for symbol keys', t => {
  t.throws(() =>
    bundleTestExports({
      [Symbol.for('iterator')]: 1,
      [Symbol.iterator]: 'a',
    }),
  );
});

test('bundleTestExports should accept a genuine module exports namespace', t => {
  // Taking into account that it will have a Symbol.toStringTag.
  bundleTestExports(namespace);
  t.pass();
});
