// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

test('agentry subpaths resolve through package exports', async t => {
  const [rootModule, harnessModule, executeModule, evalModule, editTextModule] =
    await Promise.all([
      // eslint-disable-next-line import/no-unresolved
      import('@endo/agentry'),
      // eslint-disable-next-line import/no-unresolved
      import('@endo/agentry/harness'),
      // eslint-disable-next-line import/no-unresolved
      import('@endo/agentry/execute'),
      // eslint-disable-next-line import/no-unresolved
      import('@endo/agentry/eval'),
      // eslint-disable-next-line import/no-unresolved
      import('@endo/agentry/edit-text'),
    ]);
  t.is(typeof rootModule.defineAgent, 'function');
  t.is(typeof harnessModule.makePiAgent, 'function');
  t.is(typeof executeModule.makeCodeModeAgent, 'function');
  t.is(typeof editTextModule.applyEdits, 'function');
  t.is(typeof editTextModule.normalizeEdits, 'function');
  t.is(typeof editTextModule.computeUnifiedDiff, 'function');
  t.is(typeof evalModule.runGitScenario, 'function');
  t.is(typeof evalModule.makeRunMetricsRecorder, 'function');
  t.is(typeof evalModule.resolveEvalModelFromEnv, 'function');
  t.false('conflictRebasePrompt' in evalModule);
  t.false('makeConflictRebaseScenario' in evalModule);
  t.false('assertGitConflictRebaseOutcome' in evalModule);
  t.false('makeStageAndCommitScenario' in evalModule);
  t.false('assertGitCommitOutcome' in evalModule);
});
