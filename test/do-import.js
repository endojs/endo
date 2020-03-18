import bundleSource from '@agoric/bundle-source';
import tap from 'tap';
import { importBundle } from '../src/index.js';

const transform1 = {
  rewrite(rewriterState) {
    const { src, endowments } = rewriterState;
    return {
      src: src.replace('replaceme', 'substitution'),
      endowments: { added: 'by transform', ...endowments },
    };
  },
};

async function testBundle1(b1, mode, ew) {
  const ns1 = await importBundle(b1, { endowments: ew });
  tap.equal(ns1.f1(1), 2, `ns1.f1 ${mode} ok`);
  tap.equal(ns1.f2(1), 3, `ns1.f2 ${mode} ok`);

  const endowments = { endow1: 3, ...ew };
  const ns2 = await importBundle(b1, { endowments });
  tap.equal(ns2.f1(1), 2, `ns2.f1 ${mode} ok`);
  tap.equal(ns2.f2(1), 3, `ns2.f2 ${mode} ok`);
  tap.equal(ns2.f3(1), 4, `ns2.f3 ${mode} ok`);

  const ns3 = await importBundle(b1, { endowments, transforms: [transform1] });
  tap.equal(ns3.f4('ok'), 'substitution by transform ok', `ns3.f4 ${mode} ok`);
}

tap.test('test import', async function testImport(t) {
  // nestedEvaluate requires a 'require' endowment, but doesn't call it
  function req(what) {
    console.log(`require(${what})`);
  }
  const endowments = { require: req };

  const b1getExport = await bundleSource(
    require.resolve('./bundle1.js'),
    'getExport',
  );
  await testBundle1(b1getExport, 'getExport', endowments);

  const b1NestedEvaluate = await bundleSource(
    require.resolve('./bundle1.js'),
    'nestedEvaluate',
  );
  await testBundle1(b1NestedEvaluate, 'nestedEvaluate', endowments);

  t.end();
});
