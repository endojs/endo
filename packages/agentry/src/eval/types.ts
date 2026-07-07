import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Model, Usage } from '@earendil-works/pi-ai';

/**
 * Read the UTF-8 content of an `@endo/platform/fs`-style File capability. The
 * eval scorer is handed one of these rather than importing a byte-stream
 * library, so the scorer carries no stream dependency and the caller picks the
 * reader (the tests build one over `@endo/exo-stream`).
 */
export type ReadText = (file: unknown) => Promise<string>;

/**
 * One outcome check: a named pass/fail with a human-readable detail string.
 * Shared by every eval's outcome assertion.
 */
export interface OutcomeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * The structured result of an outcome assertion: a pass/fail per named check,
 * plus an overall pass that holds only when every check holds.
 */
export interface OutcomeReport {
  pass: boolean;
  checks: OutcomeCheck[];
}

/**
 * The end-state a stage-and-commit scenario is scored against.
 */
export interface GitCommitTarget {
  /** Repository-relative path the scenario commits. */
  path: string;
  /** The exact UTF-8 content the committed file must carry at HEAD. */
  content: string;
  /** The exact commit message HEAD must carry. */
  message: string;
}

/**
 * A git code-mode eval scenario: a self-contained, model-agnostic description
 * of one task plus its outcome assertion. The same scenario is driven by a
 * scripted faux model (the no-LLM assertion-path test) and by a live model (a
 * credentialed run), so it holds no model and no provisioning — only the
 * prompt, the target end-state, and the cap-based assertion.
 */
export interface GitScenario {
  name: string;
  /** The user turn handed to the code-mode agent. */
  prompt: string;
  expected: GitCommitTarget;
  assertOutcome: (args: {
    git: unknown;
    workspace: unknown;
    readText: ReadText;
  }) => Promise<OutcomeReport>;
}

/**
 * Summed provider usage observed during one agent run. This is based on
 * `Usage` from pi-ai, narrowed to the eval reporting surface and extended with
 * provider-reported reasoning tokens when available.
 */
export interface RunUsageMetrics extends Pick<
  Usage,
  'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'totalTokens'
> {
  reasoning: number;
  cost: Pick<Usage['cost'], 'total'>;
}

/**
 * Metrics recorded from pi-agent-core events during one eval run.
 *
 * These values are diagnostic reporting only. Scenario outcome assertion
 * remains the eval's pass/fail gate.
 */
export interface RunMetrics {
  usage: RunUsageMetrics;
  /** Count of completed turns, from `turn_end`. */
  turns: number;
  /** Count of completed assistant messages. */
  assistantMessages: number;
  /** Count of completed tool executions. */
  toolExecutions: number;
  /**
   * Count of completed tool executions whose result was marked as an error.
   */
  toolExecutionErrors: number;
  /**
   * Elapsed wall time from `agent_start` through `agent_end`, or through the
   * snapshot if the run is still active.
   */
  wallTimeMs: number;
}

export interface RunGitScenarioOptions {
  /** The model under eval (faux or live). */
  model: Model<string>;
  /**
   * A live writable `@endo/platform/fs` Filesystem over the scenario repository.
   */
  workspace: unknown;
  /**
   * A live read/write `@endo/exo-git` Git capability over the same repository.
   */
  git: unknown;
  scenario: GitScenario;
  /**
   * Read a committed File's content as UTF-8; passed through to the scenario's
   * outcome assertion.
   */
  readText: ReadText;
  /** Resolve the model's API key. Omit for a faux/local model. */
  getApiKey?: import('../harness/credentials.js').GetApiKey;
  thinkingLevel?: import('../harness/model.js').ThinkingLevel;
  streamFn?: StreamFn;
}

export interface RunGitScenarioResult {
  outcome: OutcomeReport;
  metrics: RunMetrics;
}
