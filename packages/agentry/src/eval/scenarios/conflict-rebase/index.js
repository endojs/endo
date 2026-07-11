// @ts-check

// Barrel for the conflict-rebase eval: its scenario and outcome assertion.
export {
  conflictRebasePrompt,
  makeConflictRebaseScenario,
} from './scenario.js';
export { assertGitConflictRebaseOutcome } from './outcome.js';
