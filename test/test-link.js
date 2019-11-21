import { test } from 'tape-promise/tape';

import { evaluateProgram as evaluate } from '@agoric/evaluate';
import { makeEvaluateLinker } from '../src';

test('evaluate linker', async t => {
  try {
    const rootLinker = makeEvaluateLinker(evaluate);
    const linkageMap = new Map([
      [
        'https://www.example.com/foo/abc',
        {
          functorSource: `\
${async ({ liveVar, imports }) => {
  let def;
  await imports(
    new Map([['./def', new Map([['def', [$ha => (def = $ha)]]])]]),
    [],
  );

  liveVar.abc(def);
}}`,
          imports: { './def': ['def'] },
          fixedExportMap: {},
          liveExportMap: { abc: ['abc', false] },
          moduleIds: { './def': 'https://www.example.com/foo/def' },
          moduleId: 'https://www.example.com/foo/abc',
        },
      ],
      [
        'https://www.example.com/foo/def',
        {
          functorSource: `\
async ({ imports, liveVar }) => { await imports(new Map(), []); liveVar.lo(456); lo ++; }`,
          imports: {},
          fixedExportMap: {},
          liveExportMap: { def: ['lo', true] },
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
