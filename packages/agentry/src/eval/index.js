// @ts-check

// The git code-mode eval harness: drive a code-mode git-loop agent against a
// scenario and score it by **outcome assertion** (did the repository reach the
// target end-state), not by trace-edit-distance. See ./README.md for the
// eval-vs-optimize distinction.

// Shared harness.
export { runGitScenario } from './run.js';
export { resolveEvalModelFromEnv } from './env-model.js';
export { makeRunMetricsRecorder } from './metrics.js';

// Per-eval public symbols, re-exported from each eval's folder.
export {
  makeStageAndCommitScenario,
  assertGitCommitOutcome,
} from './scenarios/stage-and-commit/index.js';
