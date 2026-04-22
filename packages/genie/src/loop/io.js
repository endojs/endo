// @ts-check

/**
 * `GenieIO` — the IO surface plugged into the shared
 * `runGenieLoop({ agents, specials, io })` runner.
 *
 * Each deployment supplies its own adapter:
 *
 * - `dev-repl.js` builds a readline-backed adapter: stdin lines
 *   become `InboundPrompt`s, rendered `Chunk`s go to stdout, and
 *   `onIdle` / `onBusy` drive the background-event printer FSM.
 * - `main.js` builds a daemon-backed adapter: `followMessages()`
 *   becomes `prompts()`, buffered `Chunk`s are relayed via
 *   `reply(promptId, chunks)`, and each fully-processed inbound
 *   daemon message is `dismiss`ed once the loop is done.
 *
 * The runner only knows about this interface; it never imports from
 * either deployment.  That keeps the two adapters independently
 * testable against a fake and lets a future "remote dev-repl" adapter
 * drop in without touching the runner.
 *
 * See `PLAN/genie_loop_overview.md` § phase 5 and
 * `PLAN/genie_loop_architecture.md` § "IO adapter" for rationale.
 */

/** @import { ChatEvent } from '../agent/index.js' */

/**
 * @typedef {string | number | bigint} InboundPromptId
 *   Opaque identifier for an inbound prompt.  Readline uses a
 *   monotonically increasing sequence number; the daemon uses the
 *   inbound `message.number`.  The loop never interprets the value;
 *   it only threads it back through `reply` / `dismiss`.
 */

/**
 * @typedef {'user' | 'heartbeat' | 'special'} InboundPromptKind
 *   Classification hint supplied by the IO adapter.  Adapters that
 *   cannot tell user prompts from specials apart should mark them as
 *   `'user'` and let the shared loop fall back to prefix-matching via
 *   `specials.isSpecial`.  `'heartbeat'` is reserved for system
 *   self-sends (the daemon's `/heartbeat <tickID>` messages) so the
 *   loop can route them to a heartbeat handler without parsing the
 *   prompt text twice.
 */

/**
 * @typedef {object} InboundPrompt
 * @property {InboundPromptId} id - Correlation identifier threaded
 *   through `reply` / `dismiss`.  Opaque to the runner.
 * @property {string} text - The prompt text.  For daemon inbound
 *   messages this is the concatenation of `message.strings`.
 * @property {InboundPromptKind} [kind] - Optional classification hint.
 *   When unset the shared loop treats the prompt as `'user'` and
 *   falls back to `specials.isSpecial(text)` to detect a special.
 * @property {string} [from] - Daemon only: the sender's formula id.
 *   Unused by the runner; forwarded to adapters that need it.
 * @property {unknown} [raw] - Adapter-specific back-reference (e.g.
 *   the underlying daemon `Package & StampedMessage`).  Opaque to the
 *   runner.
 */

/**
 * @template Chunk
 * @typedef {object} GenieIO
 * @property {() => AsyncIterable<InboundPrompt>} prompts - Source of
 *   inbound prompts.  The runner awaits each prompt in order and
 *   dispatches it.  Exhausting the iterable is the "shut down" signal.
 * @property {(event: ChatEvent, options?: { label?: string }) => Iterable<Chunk>} [render]
 *   - Optional per-event renderer.  Deployments that stream to stdout
 *   (dev-repl) produce ANSI-coloured `Chunk`s here.  Deployments that
 *   buffer-then-reply (daemon) can either omit this and drive their
 *   own batching via higher-level handlers, or provide it and rely on
 *   the runner to chunk-buffer.
 * @property {(chunk: Chunk) => (void | Promise<void>)} [write] - Deliver a
 *   rendered chunk immediately.  Used by the dev-repl adapter to
 *   stream to stdout.  Daemon adapters typically omit `write` and
 *   implement `reply` instead.
 * @property {(promptId: InboundPromptId, chunks: Chunk[]) => (void | Promise<void>)} [reply]
 *   - Deliver a whole batch of chunks in response to a specific
 *   inbound prompt.  Used by the daemon adapter to call
 *   `E(agentPowers).reply(number, …)` once per chunk.  When the IO
 *   provides both `write` and `reply`, the runner prefers streaming
 *   (`write`) while a special or agent round is in flight and calls
 *   `reply` only when rebinding output to a specific prompt id is
 *   required.
 * @property {(promptId: InboundPromptId) => (void | Promise<void>)} [dismiss]
 *   - Mark a processed inbound prompt as consumed.  The daemon uses
 *   this to call `E(agentPowers).dismiss(number)`; the dev-repl
 *   leaves this unset.
 * @property {() => void} [onIdle] - Called by the runner immediately
 *   before awaiting the next prompt.  Used by the dev-repl to flush
 *   queued background-event output while the user is idle at the
 *   prompt.
 * @property {() => void} [onBusy] - Called by the runner after a
 *   prompt arrives and before dispatch begins.  Used by the dev-repl
 *   to stop flushing background output mid-stream.
 */

// This module is types-only; there are no runtime exports.
export {};
