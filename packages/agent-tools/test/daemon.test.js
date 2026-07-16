// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { Far } from '@endo/pass-style';

import { makeDaemonEvaluate } from '../src/code-mode/daemon.js';
import { makeEvaluateTool } from '../src/code-mode/evaluate-tool.js';

test('makeDaemonEvaluate forwards source and lexical names to a powers host', async t => {
  /** @type {unknown[]} */
  const calls = [];
  const powers = Far('Powers', {
    evaluate: async (...args) => {
      calls.push(args);
      return 'done';
    },
  });

  const evaluate = makeDaemonEvaluate(powers);
  const result = await evaluate({
    source: 'await E(git).status()',
    resultName: ['results', 'status'],
    globals: [
      { name: 'workspace', petName: 'repo/workspace' },
      { name: 'git', petName: ['repo', 'git'] },
    ],
  });

  t.is(result, 'done');
  t.deepEqual(calls, [
    [
      undefined,
      'await E(git).status()',
      ['workspace', 'git'],
      ['repo/workspace', ['repo', 'git']],
      ['results', 'status'],
    ],
  ]);
});

test('makeDaemonEvaluate always advertises resultName through the tool schema', t => {
  const powers = Far('Powers', {
    evaluate: async () => 'done',
  });
  const evaluate = makeDaemonEvaluate(powers);
  const tool = makeEvaluateTool(evaluate, []);
  const properties = /** @type {{ properties: Record<string, unknown> }} */ (
    tool.parameters
  ).properties;

  t.true(Object.hasOwn(properties, 'resultName'));
});
