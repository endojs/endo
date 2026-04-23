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
 * @typedef {object} PrimordialState
 * @property {'primordial' | 'piAgent'} mode
 *   - The current boot mode.  Set to `'primordial'` while the automaton
 *     owns the inbox; flipped to `'piAgent'` by sub-task 97's hand-off
 *     helper once `/model commit` succeeds.
 * @property {() => Promise<void>} activate
 *   - Sub-task 97's hand-off helper.  Invoked by a future `/model
 *     commit` path; in sub-task 94 it is retained as a stub so the
 *     automaton's constructor signature stays stable across the
 *     in-flight work.
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
