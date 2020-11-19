/* global harden */
import '@agoric/install-ses';
import { encodeBase64 } from '@agoric/base64';
import * as fs from 'fs';
import { makeArchive } from '@agoric/compartment-mapper';

import bundleSource from '@agoric/bundle-source';
import test from 'ava';
import { importBundle } from '../src/index.js';

const read = async location =>
  fs.promises.readFile(new URL(location, 'file:///').pathname);

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

  const ns3 = await importBundle(b1, { endowments, transforms: [transform1] });
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

test('test import', async function testImport(t) {
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
      require.resolve('./bundle1.js'),
      'getExport',
    );
    await testBundle1(t, b1getExport, 'getExport', endowments);
  }

  const b1NestedEvaluate = await bundleSource(
    require.resolve('./bundle1.js'),
    'nestedEvaluate',
  );
  await testBundle1(t, b1NestedEvaluate, 'nestedEvaluate', endowments);
});

test('test import archive', async function testImportArchive(t) {
  const endowments = { console };
  const b1EndoZip = await makeArchive(
    read,
    `file://${require.resolve('./bundle1.js')}`,
  );
  const b1EndoZipBase64 = encodeBase64(b1EndoZip);
  const b1EndoZipBase64Bundle = {
    moduleFormat: 'endoZipBase64',
    endoZipBase64: b1EndoZipBase64,
  };
  await testBundle1(t, b1EndoZipBase64Bundle, 'endoZipBase64', endowments);
});

test('test missing sourceMap', async function testImport(t) {
  function req(what) {
    console.log(`require(${what})`);
  }
  harden(Object.getPrototypeOf(console));
  const endowments = { require: req, console };

  const b1 = await bundleSource(
    require.resolve('./bundle1.js'),
    'nestedEvaluate',
  );
  delete b1.sourceMap;
  const ns1 = await importBundle(b1, { endowments });
  t.is(ns1.f1(1), 2, `missing sourceMap ns.f1 ok`);
});

test('inescapable transforms', async function testInescapableTransforms(t) {
  const b1 = await bundleSource(
    require.resolve('./bundle1.js'),
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

test('inescapable globalLexicals', async function testInescapableGlobalLexicals(t) {
  const b1 = await bundleSource(
    require.resolve('./bundle1.js'),
    'nestedEvaluate',
  );
  function req(what) {
    console.log(`require(${what})`);
  }
  harden(Object.getPrototypeOf(console));
  const endowments = { require: req, console };

  const ns = await importBundle(b1, {
    endowments,
    inescapableGlobalLexicals: { endow1: 3 },
  });
  t.is(ns.f3(1), 4, `iGL ns.f3 ok`);
});
