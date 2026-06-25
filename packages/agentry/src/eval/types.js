// @ts-check

/**
 * Read the UTF-8 content of an `@endo/platform/fs`-style File capability. The
 * eval scorer is handed one of these rather than importing a byte-stream
 * library, so the scorer carries no stream dependency and the caller picks the
 * reader (the tests build one over `@endo/exo-stream`).
 *
 * @typedef {(file: unknown) => Promise<string>} ReadText
 */

/**
 * A git code-mode eval scenario: a self-contained, model-agnostic description
 * of one task plus its outcome assertion. The same scenario is driven by a
 * scripted faux model (the no-LLM assertion-path test) and by a live model (a
 * credentialed run), so it holds no model and no provisioning — only the
 * prompt, the target end-state, and the cap-based assertion.
 *
 * @typedef {object} GitScenario
 * @property {string} name
 * @property {string} prompt The user turn handed to the code-mode agent.
 * @property {import('./scenarios/stage-and-commit/outcome.js').GitCommitTarget} expected
 * @property {(args: { git: unknown, workspace: unknown, readText: ReadText }) => Promise<import('./outcome-kit.js').OutcomeReport>} assertOutcome
 */

export {};
