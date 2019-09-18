import { test } from 'tape-promise/tape';

import { makeEvaluateLinker } from '../src';

test('evaluate linker', async t => {
  try {
    // eslint-disable-next-line no-new-func
    const evaluate = new Function(`
with (arguments[1]) {
  return eval(arguments[0]);
}`);

    const rootLinker = makeEvaluateLinker(evaluate);
    const linkageMap = new Map([
      [
        'https://www.example.com/foo/abc',
        {
          functorSource: `\
({ letVar, imports }) => {
  let def;
  imports({
    './def': {
      def: [$h_a => (def = $h_a)],
    },
  });

  letVar.abc(def);
}`,
          imports: { './def': ['def'] },
          fixedExports: [],
          liveExportMap: { abc: [] },
          moduleIds: { './def': 'https://www.example.com/foo/def' },
          moduleId: 'https://www.example.com/foo/abc',
        },
      ],
      [
        'https://www.example.com/foo/def',
        {
          functorSource: `({ letVar }) => { letVar.def(456); lo ++; }`,
          imports: {},
          fixedExports: [],
          liveExportMap: { def: ['lo'] },
          moduleIds: {},
          moduleId: 'https://www.example.com/foo/def',
        },
      ],
    ]);
    const recursiveLink = (moduleId, linker, preEndowments) => {
      const linkageRecord = linkageMap.get(moduleId);
      return linker.link(linkageRecord, recursiveLink, preEndowments);
    };
    const mi = recursiveLink('https://www.example.com/foo/abc', rootLinker, {});
    await mi.initialize();
    const { moduleNS } = mi;
    t.deepEqual(moduleNS, { abc: 457 }, 'linkage success');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
