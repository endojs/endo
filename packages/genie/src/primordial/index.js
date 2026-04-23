// @ts-check

/**
 * Primordial automaton — the pre-LLM message-processing path used while
 * the root genie is still waiting for a model configuration.
 *
 * Sub-task 94 of `TODO/92_genie_primordial.md` landed this module so a
 * fresh bottle answers user messages with a friendly "not configured
 * yet" reply instead of staring back silently.  Sub-task 95 will hang
 * the `/model` subcommand family off the same automaton.  The
 * dispatcher mounts `/model` (and the other built-ins) as normal
 * specials; the automaton itself therefore only has to deal with
 * plain-text prompts — `processPrompt` is reached after the IO adapter
 * classifies an inbound prompt as `kind: 'primordial'`.
 *
 * The `state` argument is the shared mutable flag object introduced in
 * sub-task 93 (carrying `{ mode: 'primordial' | 'piAgent', activate:
 * () => Promise<void> }`).  The automaton never mutates it — only the
 * piAgent hand-off helper (sub-task 97) does — but it is accepted
 * eagerly so later sub-tasks can read draft state off the same handle
 * without reshuffling constructor signatures.
 */

/**
 * @typedef {object} ModelDraft
 * @property {string} provider - Provider name (e.g. `'ollama'`,
 *   `'anthropic'`).  Must be a key of `PROVIDER_CREDENTIAL_SPEC` —
 *   `/model set` rejects unknown providers before stashing a draft.
 * @property {string} modelId - Model identifier (e.g. `'llama3.2'`,
 *   `'claude-3-5-sonnet-20241022'`).  Opaque to the `/model` handler
 *   beyond being non-empty; pi-ai validates it when `/model test`
 *   actually issues a ping.
 * @property {Record<string, string>} [credentials] - UPPER_SNAKE_CASE
 *   env-var names to raw credential values.  Captured only in the
 *   draft closure — never echoed back to the operator in the clear
 *   (`/model show` masks every value via the 6+2 rule).
 * @property {Record<string, string>} [options] - UPPER_SNAKE_CASE
 *   env-var names to non-secret option values (e.g. `OLLAMA_HOST`).
 *   Rendered verbatim by `/model show`.
 */

/**
 * @typedef {object} PrimordialState
 * @property {'primordial' | 'piAgent'} mode
 *   - The current boot mode.  Set to `'primordial'` while the automaton
 *     owns the inbox; flipped to `'piAgent'` by sub-task 97's hand-off
 *     helper (`activatePiAgent` in `packages/genie/main.js`) once
 *     `/model commit` succeeds.
 * @property {() => Promise<void>} activate
 *   - Sub-task 97's hand-off helper.  Invoked by `/model commit` in
 *     primordial mode after persistence succeeds; the daemon
 *     deployment binds this to a one-shot `activatePiAgent` runner
 *     that builds the agent pack, starts the heartbeat ticker, and
 *     flips `state.mode` to `'piAgent'`.  The dev-repl deployment (and
 *     unit tests) leave it as a no-op stub.  Subsequent calls return
 *     the same promise so `/model commit` is idempotent under
 *     concurrent invocations.
 * @property {() => Promise<void>} [requestRestart]
 *   - Optional worker-exit trigger consulted by `/model commit` in
 *     piAgent mode.  When supplied, the handler invokes it after
 *     yielding the "Restart required" reply chunk so the daemon
 *     deployment can `process.exit` and let the daemon reincarnate
 *     the worker with the freshly-persisted model config.  Absent in
 *     unit tests and in the dev-repl deployment, which both stay in
 *     primordial mode (no piAgent commit path) or manage their own
 *     model lifecycle.
 * @property {ModelDraft} [draft]
 *   - Staged model configuration, as populated by `/model set` (sub-task
 *     95).  Absent when the operator has not yet staged a draft; read by
 *     `/model test`, `/model commit`, and `/model show`.
 * @property {ModelDraft} [committed]
 *   - Active model configuration.  Populated by sub-task 96's persistence
 *     loader at boot and by `/model commit` when it succeeds; read by
 *     `/model show` / `/model list` to mark the active provider.  Stays
 *     undefined in primordial mode until a commit lands.
 * @property {object} [piAgent]
 *   - Active PiAgent instance.  Populated by sub-task 97's
 *     `activatePiAgent` helper (or by the cold-boot piAgent path) so
 *     `runAgentLoop`'s message handler can find the agent without
 *     closure-capturing it at construction time.  Absent during
 *     primordial mode; the loop's IO classifier routes around it via
 *     `state.mode === 'primordial'` so no consumer reads `state.piAgent`
 *     until activation completes.
 * @property {object} [heartbeatAgent]
 *   - Companion PiAgent dedicated to heartbeat rounds.  Populated
 *     alongside `piAgent` by `activatePiAgent`.  Absent in primordial
 *     mode (the heartbeat ticker is not started yet).
 * @property {import('../observer/index.js').Observer} [observer]
 *   - Memory-observer instance.  Populated alongside `piAgent`; absent
 *     in primordial mode and unit tests.
 * @property {import('../reflector/index.js').Reflector} [reflector]
 *   - Memory-reflector instance.  Populated alongside `piAgent`;
 *     absent in primordial mode and unit tests.
 * @property {import('../tools/registry.js').GenieTools} [genieTools]
 *   - Tool registry for the active model.  Populated alongside the
 *     agent pack so `/tools` can enumerate the live tool set after
 *     activation.  Absent in primordial mode (where `/tools` reports an
 *     empty list).
 * @property {Map<string, import('../interval/types.js').IntervalTickMessage>} [pendingHeartbeatTicks]
 *   - Side-channel map shared between `runHeartbeatTicker` and the
 *     heartbeat dispatch path.  Populated by `activatePiAgent` so the
 *     dispatcher can resolve coalesced heartbeat ticks without re-reading
 *     them from the inbox.  Absent in primordial mode.
 */

/**
 * @typedef {object} PrimordialAutomatonOptions
 * @property {string} workspaceDir
 *   - Persistent workspace root.  Unused by the sub-task 94 reply
 *     path, but sub-tasks 95 / 96 will read and write
 *     `<workspaceDir>/.genie/config.json` via the same handle.
 * @property {PrimordialState} state
 *   - Shared mode-flag object; see the typedef.
 */

/**
 * @typedef {object} PrimordialAutomaton
 * @property {(text: string) => AsyncGenerator<string>} processPrompt
 *   - Handle a plain-text prompt addressed to the root genie while in
 *     primordial mode.  Yields reply chunks that the caller forwards
 *     to `io.write` / `io.reply` via the shared
 *     `runGenieLoop`-managed drain path.
 */

/**
 * Canonical "not configured yet" reply.  Exported so tests can assert
 * against the same string the automaton produces without duplicating
 * copy across the tree.
 *
 * The copy is deliberately jargon-light — the audience is an operator
 * who has just accepted an invite from a fresh bottle and may never
 * have read the docs — and it points at exactly two affordances:
 * `/help` (the shared built-in) and `/model list` (sub-task 95's
 * entry point).
 */
export const NOT_CONFIGURED_MESSAGE = harden(
  "Hi — I don't have a language model configured yet, so I can't answer questions yet.  Send `/help` to see what I can do, or `/model list` to pick a provider.",
);
harden(NOT_CONFIGURED_MESSAGE);

/**
 * Build a primordial-mode automaton.
 *
 * @param {PrimordialAutomatonOptions} options
 * @returns {PrimordialAutomaton}
 */
export {
  PROVIDER_CREDENTIAL_SPEC,
  PROVIDER_NAMES,
  getProviderSpec,
  listKnownKeys,
} from './providers.js';

export {
  SCRATCH_PING_PROMPT,
  SCRATCH_SYSTEM_PROMPT,
  buildScratchPiAgent,
  classifyPingError,
} from './scratch-agent.js';

export {
  makeModelHandler,
  maskCredential,
} from './model-handler.js';

export {
  CONFIG_REL_PATH,
  README_TEXT,
  clearConfig,
  loadConfig,
  saveConfig,
  validateConfig,
} from './persistence.js';

export const makePrimordialAutomaton = ({ workspaceDir, state }) => {
  if (typeof workspaceDir !== 'string' || workspaceDir.length === 0) {
    throw new Error(
      'makePrimordialAutomaton: workspaceDir must be a non-empty string',
    );
  }
  if (!state || typeof state !== 'object') {
    throw new Error('makePrimordialAutomaton: state must be an object');
  }

  /**
   * @param {string} text
   * @returns {AsyncGenerator<string>}
   */
  async function* processPrompt(text) {
    // `state` is currently only read by sub-tasks 95/97; sub-task 94's
    // reply path is the same regardless of mode.  Touch it once so a
    // future refactor that drops the field surfaces as a lint failure
    // rather than silently omitting the guard.
    void state;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length === 0) {
      // An empty prompt should still get a friendly acknowledgement so
      // the sender does not think the daemon ate the message.  The
      // same pointer copy is reused — there is no separate "empty"
      // flow yet.
      yield NOT_CONFIGURED_MESSAGE;
      return;
    }
    yield NOT_CONFIGURED_MESSAGE;
  }

  return harden({ processPrompt });
};
harden(makePrimordialAutomaton);
