// @ts-check

import harden from '@endo/harden';

/** @import { GenieAgents } from './agents.js' */
/** @import { SpecialsDispatcher } from './specials.js' */
/** @import { GenieIO, InboundPrompt } from './io.js' */

/**
 * @template Chunk
 * @typedef {object} RunGenieLoopHandlers
 * @property {(prompt: InboundPrompt) => AsyncIterable<Chunk>} runUserPrompt
 *   - Adapter-specific handler for a regular user prompt.
 *    The returned iterable yields `Chunk`s that the runner delivers via
 *    `io.write` (dev-repl) or `io.reply` (daemon).
 * @property {(prompt: InboundPrompt) => (void | Promise<void>)} [runHeartbeat]
 *   - Adapter-specific handler for `kind === 'heartbeat'` prompts.
 *     The daemon self-routes its `/heartbeat <tickID>` messages here; dev-repl
 *     never takes this path (its `.heartbeat` is a normal special).
 *     When unset, heartbeat prompts fall through to the specials dispatcher.
 * @property {(prompt: InboundPrompt, err: unknown) => (void | Promise<void>)} [onError]
 *   - Optional per-prompt error hook.
 *     Called when any of the three dispatch paths (user / special / heartbeat) throws.
 *     Defaults to a no-op so the loop keeps running;
 *     deployments that want to log or reply with an error message supply their own handler.
 */

/**
 * @template Chunk
 * @typedef {object} RunGenieLoopOptions
 * @property {GenieAgents} agents
 *   - The shared agent pack.
 *     Reserved for handlers that need to touch observer / reflector state
 *     between dispatches (e.g. `afterDispatch`);
 *     the runner itself never dereferences individual fields.
 * @property {SpecialsDispatcher<Chunk>} specials
 *   - Prefix-aware specials dispatcher (prefix `.` in dev-repl, `/` in main.js).
 * @property {GenieIO<Chunk>} io - IO adapter.
 * @property {RunGenieLoopHandlers<Chunk>} handlers
 *   - Deployment-specific prompt handlers.
 * @property {(prompt: InboundPrompt) => (void | Promise<void>)} [afterDispatch]
 *   - Optional hook invoked after each dispatched prompt, before `io.dismiss`.
 *     The daemon uses this slot for `observer.check` + `observer.scheduleIdle`.
 * @property {() => boolean} [shouldExit]
 *   - Polled after each prompt.
 *     Returning `true` breaks the loop after the current prompt finishes —
 *     used by the `exit` built-in to terminate the REPL.
 */

/**
 * Classify an inbound prompt into one of `'user' | 'special' | 'heartbeat'`.
 *
 * Adapters can override by setting `prompt.kind`; otherwise the
 * runner falls back to `specials.isSpecial(text)` for text-based
 * detection.
 *
 * Heartbeat prompts must be explicitly flagged by the adapter —
 * the runner never infers heartbeat from text.
 *
 * @template Chunk
 * @param {InboundPrompt} prompt
 * @param {SpecialsDispatcher<Chunk>} specials
 * @returns {'user' | 'special' | 'heartbeat'}
 */
const classifyPrompt = (prompt, specials) => {
  if (prompt.kind === 'heartbeat') return 'heartbeat';
  if (prompt.kind === 'special') return 'special';
  if (prompt.kind === 'user') return 'user';
  // No explicit kind — fall back to prefix detection.
  return specials.isSpecial(prompt.text) ? 'special' : 'user';
};

/**
 * Drain an `AsyncIterable<Chunk>` into the IO surface.
 *
 * Prefers streaming (`io.write`) when the adapter supplies one, falling back
 * to per-chunk `io.reply(prompt.id, [chunk])`.
 *
 * Matches the current daemon behaviour of one mail-reply per yielded chunk.
 *
 * @template Chunk
 * @param {AsyncIterable<Chunk>} iter
 * @param {InboundPrompt} prompt
 * @param {GenieIO<Chunk>} io
 */
const drainChunks = async (iter, prompt, io) => {
  await Promise.resolve();
  if (io.write) {
    for await (const chunk of iter) {
      await io.write(chunk);
    }
    return;
  }
  if (io.reply) {
    for await (const chunk of iter) {
      await io.reply(prompt.id, [chunk]);
    }
    return;
  }
  // No output sink configured — drain silently so upstream async
  // generators finish cleanly.
  // eslint-disable-next-line no-unused-vars
  for await (const _ of iter) {
    // intentional drop
  }
};

/**
 * Shared genie agent loop runner — the single message-dispatch loop used by
 * both `dev-repl.js` and `main.js`.
 *
 * Each deployment supplies:
 * - an `io` adapter (readline vs. daemon inbox),
 * - a `specials` dispatcher (already prefix-parameterised via
 *   `makeSpecialsDispatcher`), and
 * - a `runUserPrompt` handler that shapes a user prompt into the
 *   `Chunk` stream appropriate for the deployment (ANSI for the
 *   dev-repl; bespoke "Thinking..." + final-message sequencing for
 *   the daemon).
 *
 * The runner itself is intentionally agnostic about `Chunk`: it just
 * dispatches prompts, drains the resulting `AsyncIterable<Chunk>`,
 * and hands each chunk to the IO adapter via `write` (streaming) or
 * `reply` (per-prompt batch).  Per-prompt "after dispatch" work
 * (observer.check / scheduleIdle, message dismissal) and
 * heartbeat handling stay outside the runner's core, delivered via
 * `handlers.runHeartbeat` and the top-level `afterDispatch` hook.
 *
 * Iterates `io.prompts()` indefinitely (or until `shouldExit`
 * returns true / the iterable is exhausted).  For each prompt:
 *
 * 1. Signals `io.onBusy` so the adapter can pause any background
 *    output coexisting with the prompt.
 * 2. Classifies the prompt as `'heartbeat'`, `'special'`, or
 *    `'user'` and dispatches it to the matching handler.
 * 3. Invokes the optional `afterDispatch` hook.
 * 4. Calls `io.dismiss(prompt.id)` when supplied (daemon uses this
 *    to acknowledge the inbound mail message).
 * 5. Signals `io.onIdle` so the adapter can resume background
 *    output before awaiting the next prompt.
 *
 * Errors thrown from any of the three dispatch paths are forwarded
 * to `handlers.onError` and swallowed so one bad prompt cannot stop
 * the loop.  The runner still calls `afterDispatch` / `io.dismiss`
 * after an error so subsequent prompts see a clean slate.
 *
 * @template Chunk
 * @param {RunGenieLoopOptions<Chunk>} options
 * @returns {Promise<void>}
 */
export const runGenieLoop = async ({
  agents: _agents,
  specials,
  io,
  handlers,
  afterDispatch,
  shouldExit,
}) => {
  const { runUserPrompt, runHeartbeat, onError } = handlers;

  // Signal idle once before the first prompt await so adapters that
  // start in "busy" (e.g. dev-repl's background printer) transition to
  // idle for the initial wait — matching the pre-runner behaviour of
  // flipping idle just before each prompt.
  if (io.onIdle) io.onIdle();

  for await (const prompt of io.prompts()) {
    if (io.onBusy) io.onBusy();
    try {
      const kind = classifyPrompt(prompt, specials);
      if (kind === 'heartbeat') {
        if (runHeartbeat) {
          await runHeartbeat(prompt);
        }
        // If no heartbeat handler is wired, silently drop — the
        // caller opted out.
      } else if (kind === 'special') {
        await drainChunks(specials.dispatch(prompt.text), prompt, io);
      } else {
        await drainChunks(runUserPrompt(prompt), prompt, io);
      }
    } catch (err) {
      if (onError) {
        try {
          await onError(prompt, err);
        } catch {
          // best-effort — never let the error hook itself kill the loop
        }
      }
    }

    try {
      if (afterDispatch) await afterDispatch(prompt);
    } catch {
      // best-effort — observer.check / scheduleIdle should not stop the loop
    }

    try {
      if (io.dismiss) await io.dismiss(prompt.id);
    } catch {
      // best-effort — dismiss is an acknowledgement, not a correctness gate
    }

    if (shouldExit && shouldExit()) break;

    if (io.onIdle) io.onIdle();
  }
};
harden(runGenieLoop);
