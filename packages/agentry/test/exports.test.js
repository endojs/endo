// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

test('agentry subpaths resolve through package exports', async t => {
  const [rootModule, harnessModule, executeModule] = await Promise.all([
    // eslint-disable-next-line import/no-unresolved
    import('@endo/agentry'),
    // eslint-disable-next-line import/no-unresolved
    import('@endo/agentry/harness'),
    // eslint-disable-next-line import/no-unresolved
    import('@endo/agentry/execute'),
  ]);
  t.is(typeof rootModule.defineAgent, 'function');
  t.is(typeof harnessModule.makePiAgent, 'function');
  t.is(typeof executeModule.makeCodeModeAgent, 'function');
});
