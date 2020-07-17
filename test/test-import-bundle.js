/* global harden */
import '@agoric/install-ses';

import bundleSource from '@agoric/bundle-source';
import tap from 'tap';
import { importBundle } from '../src/index.js';

function transform1(src) {
  return src
    .replace('replaceme', 'substitution')
    .replace('two foot wide', 'sixty feet wide');
}

async function testBundle1(b1, mode, ew) {
  const ns1 = await importBundle(b1, { endowments: ew });
  tap.equal(ns1.f1(1), 2, `ns1.f1 ${mode} ok`);
  tap.equal(ns1.f2(1), 3, `ns1.f2 ${mode} ok`);

  const endowments = { endow1: 3, ...ew };
  const ns2 = await importBundle(b1, { endowments });
  tap.equal(ns2.f3(1), 4, `ns2.f1 ${mode} ok`);
  // untransformed
  tap.equal(
    ns2.f4('is unreplaced'),
    'replaceme is unreplaced',
    `ns2.f4 ${mode} ok`,
  );
  tap.equal(
    ns2.f5('the bed'),
    'Mr. Lambert says the bed is two foot wide',
    `ns2.f5 ${mode} ok`,
  );

  const ns3 = await importBundle(b1, { endowments, transforms: [transform1] });
  tap.equal(ns3.f4('is ok'), 'substitution is ok', `ns3.f4 ${mode} ok`);
  tap.equal(
    ns3.f5('the bed'),
    'Mr. Lambert says the bed is sixty feet wide',
    `ns3.f5 ${mode} ok`,
  );

  const endowments4 = { sneakyChannel: 3, ...ew };
  const ns4 = await importBundle(b1, { endowments: endowments4 });
  tap.equal(ns4.f6ReadGlobal(), 3, `ns3.f6 ${mode} ok`);
  tap.equal(ns4.f8ReadGlobalSubmodule(), 3, `ns3.f8 ${mode} ok`);
  tap.throws(
    () => ns4.f7WriteGlobal(5),
    'Cannot assign to read only property',
    `ns4.f7 ${mode} ok`,
  );
  tap.equal(ns4.f6ReadGlobal(), 3, `ns4.f6 ${mode} ok`);
  tap.equal(ns4.f8ReadGlobalSubmodule(), 3, `ns3.f8 ${mode} ok`);
}

tap.test('test import', async function testImport(t) {
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
    await testBundle1(b1getExport, 'getExport', endowments);
  }

  const b1NestedEvaluate = await bundleSource(
    require.resolve('./bundle1.js'),
    'nestedEvaluate',
  );
  await testBundle1(b1NestedEvaluate, 'nestedEvaluate', endowments);

  t.end();
});

tap.test('test missing sourceMap', async function testImport(t) {
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
  tap.equal(ns1.f1(1), 2, `missing sourceMap ns.f1 ok`);
  t.end();
});

tap.test('inescapable transforms', async function testInescapableTransforms(t) {
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
  tap.equal(ns.f4('is ok'), 'substitution is ok', `iT ns.f4 ok`);
  t.end();
});

tap.test(
  'inescapable globalLexicals',
  async function testInescapableGlobalLexicals(t) {
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
    tap.equal(ns.f3(1), 4, `iGL ns.f3 ok`);

    t.end();
  },
);
