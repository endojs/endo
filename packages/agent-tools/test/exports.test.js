// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

test('agent-tools scoped exports resolve the relocated surfaces', async t => {
  const [root, evaluate, compartment, daemon, git, fs, pi, smallcaps] =
    await Promise.all([
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/code-mode/evaluate-tool.js'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/code-mode/compartment.js'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/code-mode/daemon.js'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/code-mode-globals/git.js'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/code-mode-globals/fs.js'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/pi'),
      // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
      import('@endo/agent-tools/adapters/smallcaps.js'),
    ]);

  t.is(typeof root.makeTool, 'function');
  t.is(typeof evaluate.makeEvaluateTool, 'function');
  t.is(typeof evaluate.EVALUATE_PARAMETERS, 'object');
  t.is(typeof compartment.makeCompartmentEvaluate, 'function');
  t.is(typeof daemon.makeDaemonEvaluate, 'function');
  t.is(typeof git.makeGitGlobal, 'function');
  t.is(typeof fs.makeWorkspaceGlobal, 'function');
  t.is(typeof pi.toPiAgentTool, 'function');
  t.is(typeof smallcaps.toolResultToSmallcaps, 'function');
});
