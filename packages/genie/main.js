// @ts-check
/* global process */
/* eslint-disable no-continue, no-await-in-loop */

/**
 * Genie main module — integrates the genie agent (src/agent) into the
 * Endo daemon's mail messaging system.
 *
 * This is the unconfined worklet counterpart of `dev-repl.js`: it wires
 * up the same tools and PiAgent, but communicates via Endo host mail
 * instead of stdin/stdout.
 *
 * The module is launched by `setup.js` via `makeUnconfined('@main', …,
 * { powersName: '@agent', env: { GENIE_MODEL, GENIE_WORKSPACE, … } })`.
 * `powers` is therefore the daemon's root host agent itself — there is
 * no intermediate `setup-genie` guest and no daemon-side configuration
 * form.  The agent loop runs under the root host's own identity, so
 * "agent ready" log lines and all subsequent replies originate from
 * the daemon's `@self` inbox.
 *
 * Configuration is read from the `env` argument passed by
 * `makeUnconfined`.  `GENIE_MODEL` and `GENIE_WORKSPACE` are required
 * and the module fails fast if either is missing; the rest fall back
 * to defaults.  See `TODO/10_genie_self.md` § 3b for the full env
 * surface forwarded by the launcher.
 *
 * Because the daemon does not yet support streaming, this module:
 *  1. Sends incremental "Thinking..." status messages during reasoning.
 *  2. Sends "Calling tool <name> <args>..." messages on tool invocations.
 *  3. Buffers assistant response tokens and sends the completed response
 *     as a single final message.
 */

import { join } from 'path';

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';

// eslint-disable-next-line import/no-unresolved
import {
  buildGenieTools,
  formatHelpLines,
  makeBuiltinSpecials,
  makeGenieAgents,
  makeSpecialsDispatcher,
  PLUGIN_DEFAULT_INCLUDE,
  runAgentRound,
  runGenieLoop,
} from '@endo/genie';

/** @import { Observer } from './src/observer/index.js' */
/** @import { Reflector } from './src/reflector/index.js' */
/** @import { GenieTools } from './src/tools/registry.js' */
/** @import { SpecialsIO } from './src/loop/builtin-specials.js' */
/** @import { SpecialHandler } from './src/loop/specials.js' */
/** @import { GenieIO, InboundPrompt, InboundPromptKind } from './src/loop/io.js' */

import { runHeartbeat, HeartbeatStatus } from './src/heartbeat/index.js';
import { makeIntervalScheduler } from './src/interval/index.js';
import { makeFTS5Backend } from './src/tools/fts5-backend.js';
import { initWorkspace } from './src/workspace/init.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { EndoAgent, EndoGuest, EndoHost, Package, StampedMessage } from '@endo/daemon' */
/** @import { IntervalTickMessage, } from './src/interval/types.js' */
/** @import { HeartbeatEvent } from './src/heartbeat/index.js' */

/**
 * @template T, R
 * @param {(r: R) => void} have
 * @param {AsyncIterable<T, R>} it
 */
async function* collectIt(have, it) {
  const r = yield* it;
  have(r);
}

/** Default endo directory name for tracking child agents. */
const DEFAULT_AGENT_DIRECTORY = 'genie';

/** Default heartbeat period: 30 minutes. */
const DEFAULT_HEARTBEAT_PERIOD_MS = 30 * 60 * 1_000;

// Register built-in API providers so getModel lookups work for known providers.
registerBuiltInApiProviders();

// ============================================================================
// Interface Definition
// ============================================================================

const GenieInterface = M.interface('Genie', {
  help: M.call().optional(M.string()).returns(M.string()),
});

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Creates the Genie daemon root agent.
 *
 * `powers` is the daemon's host root agent itself (the launcher passes
 * `powersName: '@agent'` to `makeUnconfined`), so this module owns the
 * daemon's `@self` inbox directly — there is no intermediate guest and
 * no configuration form.  Agent configuration is read from the `env`
 * argument that `makeUnconfined` forwards.  Required env vars
 * (`GENIE_MODEL`, `GENIE_WORKSPACE`) are validated up front so failures
 * surface in the worker log rather than as silent boot deadlocks.
 *
 * @param {EndoHost} powers - Host root agent from the Endo daemon
 * @param {Promise<object> | object | undefined} _context - Context (unused for now)
 * @param {{ env?: Record<string, string> }} [options] - Launcher options;
 *   `env` carries the `GENIE_*` configuration variables forwarded by
 *   `setup.js`.
 * @returns {object} The Genie exo object
 */
export const make = (powers, _context, { env = {} } = {}) => {

  /**
   * Build the tool registry for the daemon-hosted genie.
   *
   * @param {string} workspaceDir - Root directory for file tools
   */
  const buildTools = workspaceDir => {
    const searchBackend = makeFTS5Backend({ dbDir: workspaceDir });
    return buildGenieTools({
      workspaceDir,
      include: PLUGIN_DEFAULT_INCLUDE,
      searchBackend,
    });
  };

  /**
   * @typedef {object} AgentConfig
   * @property {'piAgent' | 'primordial'} mode - Boot mode.  `piAgent`
   *   wires the full PiAgent + heartbeat + observer/reflector pack;
   *   `primordial` skips all of that and runs a stub inbox loop so
   *   the operator can install a model via `/model` (sub-task 95).
   *   Extra modes (e.g. degraded-no-tools) can extend the same
   *   surface in the future without reshuffling arguments.
   * @property {string} [model] - LLM model spec.  Required when
   *   `mode === 'piAgent'`; unused (and typically absent) in
   *   primordial mode.
   * @property {string} workspace
   * @property {string} [name]
   * @property {string} [agentDirectory]
   * @property {string} [heartbeatPeriod]
   * @property {string} [heartbeatTimeout]
   * @property {string} [observerModel] - Model string for the observer
   *   agent.  Defaults to the main chat model.  A fast,
   *   non-reasoning model is recommended.
   * @prop {string} [reflectorModel] - Model string for the reflector
   *   agent.  Defaults to the main chat model.  A reasoning-capable
   *   model is recommended.
   */

  /**
   * Process a single inbound message by running a genie chat round and
   * relaying events back to the sender via daemon mail.
   *
   * @param {EndoAgent} agentPowers - The agent's powers (for send/reply).
   *   For the root genie this is the daemon's host root agent; for
   *   future child agents it would be a provisioned guest.
   * @param {object} piAgent - The PiAgent instance
   * @param {object} inboxMessage - The inbound daemon message
   * @param {bigint} inboxMessage.number - Message number for reply/dismiss
   * @param {string[]} inboxMessage.strings - Text fragments of the message
   * @param {string} inboxMessage.from - Sender formula ID
   */
  const processMessage = async (agentPowers, piAgent, inboxMessage) => {
    const { number, strings } = inboxMessage;

    // Reconstruct the user prompt from the message text fragments.
    const prompt = strings.join('').trim();
    if (!prompt) {
      await E(agentPowers).reply(
        number,
        ['(empty message — nothing to do)'],
        [],
        [],
      );
      return;
    }

    console.log(
      `[genie] Processing message #${number}: ${prompt.slice(0, 120)}...`,
    );

    // Track whether we have sent a "Thinking..." status so we can avoid
    // spamming duplicate status messages.
    let sentThinking = false;

    try {
      // Iterate the async generator returned by runAgentRound.
      for await (const event of runAgentRound(piAgent, prompt)) {
        switch (event.type) {
          // -----------------------------------------------------------------
          // 1. Reasoning / thinking phases -> send "Thinking..." status
          // -----------------------------------------------------------------
          case 'Thinking':
          // falls through — both thinking and text deltas signal activity
          case 'Message': {
            // For streaming deltas (assistant_delta role) and thinking
            // events, send a single "Thinking..." status so the user
            // knows the agent is working.
            if (
              event.type === 'Thinking' ||
              (event.type === 'Message' && event.role === 'assistant_delta')
            ) {
              if (!sentThinking) {
                sentThinking = true;
                await E(agentPowers).reply(number, ['Thinking...'], [], []);
              }
              break;
            }

            // Final assistant message -> send the full buffered response
            if (
              event.type === 'Message' &&
              event.role === 'assistant' &&
              event.content
            ) {
              await E(agentPowers).reply(number, [event.content], [], []);
            }
            break;
          }

          // -----------------------------------------------------------------
          // 2. Tool calls -> send "Calling tool <name> <args>..." status
          // -----------------------------------------------------------------
          case 'ToolCallStart': {
            const argsPreview = (() => {
              try {
                const s = JSON.stringify(event.args);
                return s.length > 120 ? `${s.slice(0, 120)}...` : s;
              } catch {
                return '(args)';
              }
            })();
            await E(agentPowers).reply(
              number,
              [`Calling tool ${event.toolName} ${argsPreview}...`],
              [],
              [],
            );
            break;
          }

          case 'ToolCallEnd': {
            const status =
              'error' in event && event.error ? 'failed' : 'completed';
            console.log(`[genie] Tool ${event.toolName} ${status}`);
            break;
          }

          // -----------------------------------------------------------------
          // Errors
          // -----------------------------------------------------------------
          case 'Error': {
            console.error(`[genie] Agent error: ${event.message}`);
            await E(agentPowers).reply(
              number,
              [`Error: ${event.message}`],
              [],
              [],
            );
            break;
          }

          default:
            break;
        }
      }
    } catch (err) {
      const errorMessage = /** @type {Error} */ (err).message || String(err);
      console.error(`[genie] Unhandled error during chat round:`, errorMessage);
      await E(agentPowers).reply(
        number,
        [`Genie error: ${errorMessage}`],
        [],
        [],
      );
    }
  };

  /**
   * Process a heartbeat tick: build a heartbeat prompt, run an agent
   * round, record the result, and resolve the tick.
   *
   * @param {EndoAgent} agentPowers
   * @param {object} piAgent
   * @param {string} agentName
   * @param {string} workspaceDir
   * @param {Package & StampedMessage} message
   * @param {Map<string, IntervalTickMessage>} pendingHeartbeatTicks - Side-channel map for tick lookup
   * @param {(Package & StampedMessage)[]} extraHeartbeats
   */
  const processHeartbeat = async (
    agentPowers,
    piAgent,
    agentName,
    workspaceDir,
    message,
    pendingHeartbeatTicks,
    extraHeartbeats,
  ) => {
    /** @param {Package} m */
    const getHeartbeatTick = m => {
      const { strings: [first = ''] } = m;
      const head = first.trim().toLowerCase();
      const id = head.startsWith('/heartbeat') ? (head.split(/\s+/)[1] ?? '') : '';
      const tick = id ? pendingHeartbeatTicks.get(id) : undefined;
      return { id, tick };
    };

    const { number: messageNumber } = message;
    const { id: tickID, tick } = getHeartbeatTick(message);

    if (tick) {
      console.log(
        `[genie:${agentName}] Heartbeat tick #${tick.tickNumber} (missed: ${tick.missedTicks})`,
      );
    } else if (tickID) {
      console.warn(
        `[genie:${agentName}] Heartbeat from stale message (no tick found for ${tickID})`,
      );
    } else {
      console.log(
        `[genie:${agentName}] Manual Heartbeat (message: ${message.strings[0]})`,
      );
    }

    /** @type {HeartbeatEvent|null} */
    let heartbeatEvent = null;

    try {
      for await (const event of collectIt(
        he => { heartbeatEvent = he },
        runHeartbeat({
          workspaceDir,
          piAgent,
          // NOTE now = Date.now,
        }))) {
        // TODO this event handling should be shared with normal runAgentRound
        switch (event.type) {
          case 'Message': {
            if (event.role === 'assistant' && event.content) {
              // TODO start reply and then stream edits back
              // await E(agentPowers).reply(
              //   messageNumber,
              //   [event.content],
              //   [],
              //   [],
              // );
            }
            break;
          }
          case 'Thinking': {
            // TODO stream edit w/ status event.content
            break;
          }
          case 'ToolCallStart': {
            // TODO stream edit w/ status
            console.log(
              `[genie:${agentName}] Heartbeat tool: ${event.toolName}`,
            );
            break;
          }
          case 'Error': {
            // TODO stream edit w/ status
            console.error(
              `[genie:${agentName}] Heartbeat error: ${event.message}`,
            );
            break;
          }
          default:
            break;
        }
      }
    } catch (err) {
      const errorMessage = /** @type {Error} */ (err).message || String(err);
      console.error(`[genie:${agentName}] Heartbeat run error:`, errorMessage);
    }

    if (heartbeatEvent) {
      // TODO why need the cast
      const status = /** @type {HeartbeatEvent} */(heartbeatEvent).status;
      if (status == HeartbeatStatus.Ok) {
        console.log(`[genie:${agentName}] Heartbeat done`);
      } else {
        console.error(`[genie:${agentName}] Heartbeat done, not ok:`, heartbeatEvent);
      }
    }

    // TODO final edit
    // await E(agentPowers).reply(
    //   messageNumber,
    //   [responseText],
    //   [],
    //   [],
    // );

    // Resolve the primary tick so the scheduler advances to the next period.
    if (tick) {
      try {
        tick.tickResponse.resolve();
      } finally {
        pendingHeartbeatTicks.delete(tickID);
      }
    }

    // Resolve all coalesced heartbeat ticks and dismiss their messages.
    // The primary heartbeat message is dismissed by the shared
    // `runGenieLoop` via `io.dismiss(prompt.id)` once this handler
    // returns, so only the coalesced extras are dismissed here.
    for (const extra of extraHeartbeats) {
      const { id: extraTickId, tick: extraTick } = getHeartbeatTick(extra);
      if (extraTick) {
        try {
          extraTick.tickResponse.resolve();
        } catch {
          // best-effort
        } finally {
          pendingHeartbeatTicks.delete(extraTickId);
        }
      }
      try {
        await E(agentPowers).dismiss(extra.number);
      } catch {
        // best-effort
      }
    }

    // Ensure messageNumber participates in the returned close-out.
    void messageNumber;
  };

  /**
   * Set up the heartbeat interval scheduler for an agent.
   *
   * Creates a per-agent `IntervalScheduler` whose `onTick` callback
   * delivers heartbeat messages into the agent's daemon inbox via
   * `E(agentGuest).send()`.  The message loop in `runAgentLoop`
   * detects these and dispatches them through `processHeartbeat`.
   *
   * If the agent loop promise rejects, the scheduler is torn down so
   * no further ticks fire.
   *
   * @param {object} opts
   * @param {EndoAgent} opts.agentGuest - The agent's mail-capable powers.
   *   For the root genie this is the daemon's host root agent; the
   *   `@self` self-send below routes back to the same inbox the agent
   *   loop is following, so no special targeting is needed.
   * @param {string} opts.agentName - Display name for logging
   * @param {string} opts.workspaceDir - Agent workspace directory
   * @param {number} opts.heartbeatPeriodMs - Heartbeat period in ms (0 disables)
   * @param {number} opts.heartbeatTimeoutMs - Per-tick timeout in ms
   * @param {Promise<any>} opts.cancelledP - Resolves when the agent is cancelled (triggers teardown)
   * @param {Map<string, IntervalTickMessage>} opts.pendingHeartbeatTicks - Side-channel map shared with runAgentLoop
   * @param {() => string} opts.makeTickId - Creates new tick correlation IDs
   */
  const runHeartbeatTicker = async ({
    agentGuest,
    agentName,
    workspaceDir,
    heartbeatPeriodMs,
    heartbeatTimeoutMs,
    cancelledP,
    pendingHeartbeatTicks,
    makeTickId,
  }) => {
    if (heartbeatPeriodMs <= 0) {
      return;
    }

    // TODO store this in endo space?
    const intervalsDir = join(workspaceDir, '.genie', agentName, 'intervals');

    /**
     * onTick callback — sends a heartbeat message into the agent's
     * own daemon inbox so it is processed in FIFO order by the
     * message loop, interleaved with normal user messages.
     *
     * @param {IntervalTickMessage} tick
     */
    const onTick = tick => {
      switch (tick.label) {
        case 'heartbeat': {
          const { tickNumber, scheduledAt, actualAt, missedTicks } = tick;

          // Generate a correlation ID and store the tick in the
          // side-channel map so runAgentLoop can retrieve it.
          const tickID = `hb-${makeTickId()}`;
          pendingHeartbeatTicks.set(tickID, tick);

          console.info(`[genie:${agentName}] Sending HEARTBEAT message (${tickID}):`, {
            tickNumber,
            scheduleLag: actualAt - scheduledAt,
            missedTicks,
          });

          // Fire-and-forget: deliver the heartbeat as a daemon mail
          // message to ourselves.  The message loop detects and handles
          // `/heartbeat` strings with an optional tick correlation id.
          E(agentGuest)
            .send(
              `@self`,
              [`/heartbeat ${tickID}`],
              [],
              [],
            )
            .catch(err => {
              console.error(`[genie:${agentName}] Failed to send heartbeat message:`, err.message);
              // Clean up the map entry and resolve the tick to
              // prevent the scheduler from stalling.
              pendingHeartbeatTicks.delete(tickID);
              tick.tickResponse.resolve();
            });
        }; break;

        default: {
          console.warn(`[genie:${agentName}] Unknown scheduler tick:`, tick);
        }
      }
    };

    try {
      const {
        scheduler,
        schedulerControl: heartbeatControl,
      } = await makeIntervalScheduler({
        persistDir: intervalsDir,
        onTick,
      });

      // Tear down the scheduler when the agent is cancelled.
      cancelledP.then(() => heartbeatControl.revoke());

      await scheduler.makeInterval(
        'heartbeat',
        heartbeatPeriodMs,
        {
          tickTimeoutMs: heartbeatTimeoutMs,
        },
      );
      console.log(
        `[genie:${agentName}] Heartbeat scheduled: period=${heartbeatPeriodMs}ms, timeout=${heartbeatTimeoutMs}ms`,
      );
    } catch (err) {
      console.error(
        `[genie:${agentName}] Failed to create heartbeat scheduler:`,
        /** @type {Error} */(err).message,
      );
    }
  };

  /**
   * Run the message processing loop for a single agent guest.
   *
   * Follows the agent powers' inbox and dispatches each inbound message
   * to processMessage, using those same powers so that replies
   * originate from the agent's identity — `@self` for the root genie
   * under the post-refactor boot shape, or the child guest's identity
   * when `spawnAgent` drives this loop for a sub-agent.
   *
   * Heartbeat messages (type `'heartbeat'`) are detected and coalesced:
   * if multiple heartbeat messages have accumulated, only one heartbeat
   * round runs and all stacked heartbeat ticks are resolved.
   *
   * @param {object} opts
   * @param {EndoAgent} opts.agentPowers - The agent's mail-capable powers
   *   (root genie passes the daemon host; future child agents would
   *   pass a provisioned guest)
   * @param {object} opts.piAgent - The PiAgent instance
   * @param {object} opts.heartbeatAgent - The dedicated heartbeat PiAgent instance.
   * @param {string} opts.agentName - Display name for logging
   * @param {string} opts.workspaceDir - Agent workspace directory
   * @param {Promise<any>} opts.cancelledP - Resolves when the agent is cancelled
   * @param {Map<string, IntervalTickMessage>} opts.pendingHeartbeatTicks - Side-channel map for tick lookup
   * @param {GenieTools} opts.genieTools
   * @param {Observer} [opts.observer] - Observer instance from makeObserver
   * @param {Reflector} [opts.reflector] - Reflector instance from makeReflector
   */
  const runAgentLoop = async ({
    agentPowers,
    piAgent,
    heartbeatAgent,
    agentName,
    workspaceDir,
    cancelledP,
    pendingHeartbeatTicks,
    observer,
    reflector,
    genieTools,
  }) => {
    const selfId = await E(agentPowers).locate('@self');
    const messageIterator = makeRefIterator(E(agentPowers).followMessages());

    // ── Specials dispatcher ────────────────────────────────────────
    // The `/observe`, `/reflect`, `/help`, `/tools`, `/clear`, and
    // `/exit` slash commands are routed through the shared
    // `makeBuiltinSpecials` so the daemon and the dev-repl stay on
    // one implementation.  `/heartbeat` is intentionally **not**
    // mounted here: heartbeat messages are system self-sends handled
    // separately below so they can drive tick resolution and
    // coalescing.
    const toolNames = Object.keys(genieTools.tools);

    /** @type {SpecialsIO<string>} */
    const dispatcherIo = harden({
      info: msg => msg,
      notice: msg => msg,
      warn: msg => msg,
      error: msg => msg,
      success: msg => msg,
      // Drain events silently — the daemon does not yet forward
      // sub-agent events back through mail.
      // Consuming the iterator is still required so the observer / reflector
      // cycles run to completion.
      renderEvents: async function* drain(events) {
        for await (const _event of events) {
          // TODO once we have progressive message edits
        }
      },
      listToolNames: () => toolNames.slice(),
      listHelpLines: () => formatHelpLines({
        prefix: '/',
        // Only the handlers actually mounted below; `/heartbeat`
        // remains a system self-send, so it is intentionally absent.
        commands: ['help', 'tools', 'observe', 'reflect'],
      }),
    });

    const allBuiltins = makeBuiltinSpecials({
      agents: { piAgent, heartbeatAgent, observer, reflector },
      workspaceDir,
      io: dispatcherIo,
    });

    // Mount only the user-facing built-ins; `/heartbeat` stays with
    // the system handler below.
    const dispatcher = makeSpecialsDispatcher({
      prefix: '/',
      handlers: harden({
        observe: allBuiltins.observe,
        reflect: allBuiltins.reflect,
        help: allBuiltins.help,
        tools: allBuiltins.tools,
      }),
      /** @type {SpecialHandler<string>} */
      onUnknown: async function* onUnknown([head]) {
        yield `Unknown command: /${head}. Type /help for a list of commands.`;
      },
    });

    /**
     * Collect any additional pending heartbeat messages from the
     * iterator without blocking.  Returns an array of heartbeat
     * messages that need to be dismissed along at end of heartbeat.
     */
    const drainPendingHeartbeats = async () => {
      /** @type {Array<Package & StampedMessage>} */
      const extra = [];
      const allMessages = await E(agentPowers).listMessages();
      for (const m of allMessages) {
        if (m.from === selfId) {
          continue;
        }
        if (m.type !== 'package') {
          continue;
        }
        const { strings: [first = ''] } = m;
        const head = first.trim().toLowerCase();
        if (head.startsWith('/heartbeat')) {
          extra.push(m);
        }
      }
      return extra;
    };

    // ── IO adapter for the shared `runGenieLoop` ───────────────────
    // Each inbound daemon message becomes an `InboundPrompt`; the adapter
    // classifies heartbeat self-sends as `kind='heartbeat'`, other
    // slash-prefixed messages as `kind='special'`, and everything else as
    // `kind='user'` so the runner can route them without re-parsing the text.
    //
    // Cancellation is plumbed through `cancelledP` — racing the message
    // iterator against the cancel sentinel matches the pre-migration shutdown
    // semantics.
    /** @type {Promise<{cancelled: any}>} */
    const cancelSentinel = cancelledP.then((cancelled) => ({ cancelled }));

    /** @returns {AsyncGenerator<InboundPrompt>} */
    async function* daemonPrompts() {
      while (true) {
        const result = await Promise.race([
          messageIterator.next(),
          cancelSentinel,
        ]);

        // Exit the loop when the agent is cancelled externally.
        if ('cancelled' in result) {
          const { cancelled } = result;
          console.log(`[genie:${agentName}] Agent loop cancelled`, cancelled);
          return;
        }

        const { value: message, done } = result;
        if (done) return;

        // Skip our own outbound messages.
        if (message.from === selfId) continue;
        if (message.type !== 'package') {
          console.warn(`[genie:${agentName}] Unhandled message #${message.number} (type: ${message.type})`);
          continue;
        }

        const [first = ''] = message.strings;
        const trimmed = first.trim();
        const head = trimmed.toLowerCase();
        /** @type {InboundPromptKind} */
        let kind = 'user';
        if (head.startsWith('/heartbeat')) {
          kind = 'heartbeat';
        } else if (dispatcher.isSpecial(trimmed)) {
          kind = 'special';
        }
        yield harden({
          id: message.number,
          text: trimmed,
          kind,
          from: message.from,
          raw: message,
        });
      }
    }

    /** @type {GenieIO<string>} */
    const genieIo = harden({
      prompts: () => daemonPrompts(),
      // One reply per yielded chunk (drop empties) — mirrors the
      // pre-migration "one mail reply per progress string" behaviour
      // for slash-command output.
      reply: async (promptId, chunks) => {
        // `InboundPromptId` is `string | number | bigint` for the
        // generic loop contract, but the daemon adapter always threads
        // `message.number` (a bigint) through `id`, so narrowing here
        // is sound.
        const messageNumber = /** @type {bigint} */ (promptId);
        for (const chunk of chunks) {
          if (chunk) {
            await E(agentPowers).reply(promptId, [chunk], [], []);
          }
        }
      },
      dismiss: async promptId => {
        const messageNumber = /** @type {bigint} */ (promptId);
        try {
          await E(agentPowers).dismiss(messageNumber);
        } catch {
          // Best-effort dismiss.
        }
      },
    });

    await runGenieLoop({
      agents: { piAgent, heartbeatAgent, observer, reflector },
      specials: dispatcher,
      io: genieIo,

      handlers: harden({
        /**
         * Normal user-message handler.
         * Performs the same side-effects (resetIdleTimer, processMessage) as
         * the pre-migration `runAgentLoop` user branch; no output chunks are
         * yielded because `processMessage` already streams "Thinking…" /
         * final-message replies directly via `E(agentPowers).reply`.
         *
         * @param {InboundPrompt} prompt
         */
        runUserPrompt: async function* runUserPrompt(prompt) {
          const message = /** @type {Package & StampedMessage} */ (prompt.raw);
          console.log(`[genie:${agentName}] New message #${prompt.id} (type: ${message.type})`);

          // Reset the observer idle timer on each inbound message so
          // opportunistic observation only fires after a quiet period.
          if (observer) {
            observer.resetIdleTimer();
          }

          try {
            await processMessage(agentPowers, piAgent, message);
          } catch (err) {
            const errorMessage = /** @type {Error} */ (err).message || String(err);
            console.error(
              `[genie:${agentName}] Failed to process message #${prompt.id}:`,
              errorMessage,
            );
          }
        },

        /**
         * Heartbeat self-send handler.
         *
         * Coalesces any other pending heartbeat messages and runs a single
         * heartbeat round; the runner then dismisses the primary heartbeat
         * message via `io.dismiss`.
         *
         * The coalesced extras are dismissed inside `processHeartbeat` because
         * they never appear to the runner as distinct prompts.
         *
         * @param {InboundPrompt} prompt
         */
        runHeartbeat: async prompt => {
          const message = /** @type {Package & StampedMessage} */ (prompt.raw);
          const extraHeartbeats = await drainPendingHeartbeats();
          try {
            await processHeartbeat(
              agentPowers,
              heartbeatAgent,
              agentName,
              workspaceDir,
              message,
              pendingHeartbeatTicks,
              extraHeartbeats,
            );
          } catch (err) {
            const errorMessage =
              /** @type {Error} */ (err).message || String(err);
            console.error(
              `[genie:${agentName}] Heartbeat processing error:`,
              errorMessage,
            );
          }
          if (reflector) {
            try {
              const triggered = await reflector.checkAndRun();
              if (triggered) {
                console.log(
                  `[genie:${agentName}] Reflector triggered during heartbeat`,
                );
              }
            } catch (err) {
              console.error(
                `[genie:${agentName}] Reflector error:`,
                /** @type {Error} */(err).message || String(err),
              );
            }
          }

        },

        /**
         * Error hook — the runner catches errors thrown from any of the
         * three dispatch paths and forwards them here.  We log and
         * attempt a best-effort `reply` so the sender sees the failure.
         *
         * @param {InboundPrompt} prompt
         * @param {unknown} err
         */
        onError: async (prompt, err) => {
          const errorMessage = /** @type {Error} */(err).message || String(err);
          console.error(`[genie:${agentName}] Dispatch error for #${prompt.id}:`, errorMessage);
          try {
            // See `io.reply` above — the daemon adapter's prompt ids
            // are always bigints even though `InboundPromptId` allows
            // string / number for other deployments.
            await E(agentPowers).reply(
              /** @type {bigint} */ (prompt.id),
              [`Dispatch error: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // best-effort
          }
        },
      }),

      /**
       * After-dispatch hook — runs for every prompt (user / special /
       * heartbeat) so the observer's unobserved-token accounting and
       * idle-timer scheduling stay in lockstep with inbound traffic.
       *
       * @param {InboundPrompt} _prompt
       */
      afterDispatch: async _prompt => {
        if (observer) {
          observer.check(piAgent);
          observer.scheduleIdle(piAgent);
        }
      },
    });
  };

  /**
   * Provision a new Endo guest for the agent, build its tools and
   * PiAgent, set up a heartbeat interval, announce readiness, and
   * start the message loop.
   *
   * When `parentPowers` is provided, the child agent's locator is
   * stored in the parent's agent directory so that the parent can
   * discover its children via the endo pet namespace.  The child
   * receives only explicitly introduced names (e.g. workspace mount)
   * and cannot see the parent, siblings, or host-level names.
   *
   * @param {FarRef<EndoHost>} hostAgent - The host agent reference
   * @param {string} agentName - Pet name for the new agent guest
   * @param {AgentConfig} config - Agent configuration
   * @param {EndoGuest} [parentPowers] - Optional parent guest powers for scoped child tracking
   */
  const spawnAgent = async (hostAgent, agentName, config, parentPowers) => {
    const profileName = `profile-for-${agentName}`;

    // Build introducedNames: only grant capabilities the child needs.
    /** @type {Record<string, string>} */
    const introducedNames = {};
    if (await E(hostAgent).has('workspace-mount')) {
      introducedNames['workspace-mount'] = 'workspace';
    }

    // Guard idempotency — on restart the guest already exists.
    /** @type {EndoGuest} */
    let agentGuest;
    if (await E(hostAgent).has(agentName)) {
      agentGuest = /** @type {EndoGuest} */ (
        await E(hostAgent).lookup(agentName)
      );
    } else {
      agentGuest = /** @type {EndoGuest} */ (
        await E(hostAgent).provideGuest(agentName, {
          agentName: profileName,
          introducedNames: harden(introducedNames),
        })
      );
    }

    // If spawned by a parent agent, record the child in the parent's
    // agent directory so discovery uses the endo pet namespace.
    if (parentPowers) {
      const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
      if (!(await E(parentPowers).has(agentDirName))) {
        await E(parentPowers).makeDirectory(agentDirName);
      }
      const childLocator = await E(agentGuest).locate('@self');
      if (!childLocator) {
        throw new Error(`unable to locate ${agentName}/@self`);
      }
      await E(parentPowers).storeLocator(
        [agentDirName, agentName],
        childLocator,
      );
    }

    const workspaceDir = config.workspace || process.cwd();

    // Seed the workspace from the shipped template on first spawn.
    // Existing files are never overwritten.
    const didInit = await initWorkspace(workspaceDir);
    if (didInit) {
      console.log(
        `[genie:${agentName}] Workspace initialised from template: ${workspaceDir}`,
      );
    }

    // Cancellation kit — resolving `cancel` signals all sub-systems
    // (agent loop, heartbeat, etc.) to tear down.
    const { promise: cancelledP, resolve: cancel } = makePromiseKit();

    const genieTools = buildTools(workspaceDir);

    // Shared side-channel map for delivering heartbeat tick objects from
    // runHeartbeatTicker to runAgentLoop without serializing through daemon mail.
    /** @type {Map<string, IntervalTickMessage>} */
    const pendingHeartbeatTicks = new Map();
    const makeTickId = (() => {
      let value = 0;
      return () => {
        return `${value++}`;
      };
    })();

    const { piAgent, heartbeatAgent, observer, reflector } = await makeGenieAgents({
      hostname: 'endo-daemon',
      workspaceDir,
      tools: genieTools,
      config: {
        model: config.model || undefined,
        observerModel: config.observerModel || undefined,
        reflectorModel: config.reflectorModel || undefined,
      },
    });

    const observerModelLog = config.observerModel || config.model || '(default)';
    const reflectorModelLog = config.reflectorModel || config.model || '(default)';
    console.log(
      `[genie:${agentName}] Memory sub-agents: observer=${observerModelLog}, reflector=${reflectorModelLog}`,
    );

    // Start the message loop (fire-and-forget).
    const agentLoopP = runAgentLoop({
      agentPowers: agentGuest,
      piAgent,
      heartbeatAgent,
      agentName,
      workspaceDir,
      cancelledP,
      pendingHeartbeatTicks,
      observer,
      reflector, // TODO decouple more?
    });

    // If the agent loop crashes, trigger cancellation so dependent
    // sub-systems (heartbeat, etc.) also tear down.
    agentLoopP.catch(err => {
      console.error(`[genie:${agentName}] Agent loop error:`, err);
      cancel(undefined);
    });

    // ── Heartbeat interval ─────────────────────────────────────────
    const heartbeatPeriodMs = config.heartbeatPeriod
      ? Number(config.heartbeatPeriod)
      : DEFAULT_HEARTBEAT_PERIOD_MS;
    const heartbeatTimeoutMs = config.heartbeatTimeout
      ? Number(config.heartbeatTimeout)
      : heartbeatPeriodMs / 2;
    await runHeartbeatTicker({
      agentGuest,
      agentName,
      workspaceDir,
      heartbeatPeriodMs,
      heartbeatTimeoutMs,
      cancelledP,
      pendingHeartbeatTicks,
      makeTickId,
    });

    // Announce readiness from the agent's own identity.
    const heartbeatInfo =
      heartbeatPeriodMs > 0
        ? `, heartbeat: ${heartbeatPeriodMs / 1000}s`
        : '';
    const readyMess = `agent ready (model: ${config.model}, workspace: ${workspaceDir}${heartbeatInfo})`;
    await E(agentGuest).send(
      '@host',
      [`Genie ${readyMess}.`],
      [],
      [],
    );
    console.log(`[genie:${agentName}] ${readyMess}`,);
  };
  // `spawnAgent` is no longer invoked on boot — the root genie now
  // owns `@self` directly via `runRootAgent` below — but the helper is
  // retained for the future child-agent spawning UX (TODO/10
  // Clarification 2).  Harden it so the unused-export-style binding
  // satisfies lint and so the kept code path stays SES-correct.
  harden(spawnAgent);

  /**
   * Remove a child agent: delete its entry from the parent's agent
   * directory and remove the host-level guest reference so GC can
   * collect the orphaned guest and its transitive dependencies.
   *
   * @param {FarRef<EndoHost>} hostAgent - The host agent reference
   * @param {EndoGuest} parentPowers - The parent guest's powers
   * @param {{ agentDirectory?: string }} config - Configuration (for directory name)
   * @param {string} childName - Pet name of the child agent to remove
   */
  const removeChildAgent = async (
    hostAgent,
    parentPowers,
    config,
    childName,
  ) => {
    const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
    // Remove the child from the parent's directory.
    await E(parentPowers).remove(agentDirName, childName);
    // Remove the host-level guest reference so GC collects the guest.
    await E(hostAgent).remove(childName);
  };
  harden(removeChildAgent);

  /**
   * List child agents visible in a parent's agent directory.
   *
   * @param {EndoGuest} parentPowers - The parent guest's powers
   * @param {{ agentDirectory?: string }} config - Configuration (for directory name)
   * @returns {Promise<string[]>} Pet names of child agents
   */
  const listChildAgents = async (parentPowers, config) => {
    const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
    if (!(await E(parentPowers).has(agentDirName))) {
      return [];
    }
    const result = await E(parentPowers).list(agentDirName);
    return /** @type {string[]} */ (result);
  };
  harden(listChildAgents);

  /**
   * Minimal inbox loop used when `runRootAgent` is invoked in
   * primordial mode.  Follows the daemon inbox, replies to each
   * non-self message with a fixed placeholder, and exits when the
   * cancel sentinel resolves.  There is deliberately no piAgent, no
   * tool dispatch, and no heartbeat here — sub-task 94 lands the
   * real primordial automaton.  The stub exists only so operator
   * messages do not silently pile up while the worker waits for
   * `/model` (sub-task 95).
   *
   * @param {object} opts
   * @param {EndoAgent} opts.agentPowers - Mail-capable powers; for the
   *   root genie this is the daemon's host root agent (`@self`).
   * @param {string} opts.agentName - Display name for logging.
   * @param {Promise<any>} opts.cancelledP - Resolves when the agent is
   *   cancelled; races with the inbox iterator to tear the loop down.
   */
  const runPrimordialStubLoop = async ({
    agentPowers,
    agentName,
    cancelledP,
  }) => {
    const selfId = await E(agentPowers).locate('@self');
    const messageIterator = makeRefIterator(E(agentPowers).followMessages());

    /** @type {Promise<{cancelled: any}>} */
    const cancelSentinel = cancelledP.then(cancelled => ({ cancelled }));

    const placeholder =
      '(primordial mode — no model configured; `/model` arrives in sub-task 95)';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await Promise.race([
        messageIterator.next(),
        cancelSentinel,
      ]);
      if ('cancelled' in result) {
        console.log(
          `[genie:${agentName}] Primordial loop cancelled`,
          result.cancelled,
        );
        return;
      }
      const { value: message, done } = result;
      if (done) return;
      if (message.from === selfId) continue;
      if (message.type !== 'package') {
        console.warn(
          `[genie:${agentName}] Primordial loop ignoring message #${message.number} (type: ${message.type})`,
        );
        continue;
      }
      const preview = message.strings.join('').trim().slice(0, 120);
      console.log(
        `[genie:${agentName}] Primordial stub reply to #${message.number}: ${preview}`,
      );
      try {
        await E(agentPowers).reply(message.number, [placeholder], [], []);
      } catch (err) {
        const errorMessage = /** @type {Error} */ (err).message || String(err);
        console.error(
          `[genie:${agentName}] Primordial reply failed for #${message.number}:`,
          errorMessage,
        );
      }
    }
  };

  /**
   * Boot the genie agent loop directly under the daemon's root host
   * agent (`powers`).  This replaces the previous form-driven
   * `provideGuest` boot: there is no intermediate `setup-genie` guest,
   * no `host-agent` lookup bounce, and no nested guest profile —
   * `powers` already *is* the daemon's `@self`.
   *
   * The body mirrors the relevant portion of `spawnAgent` (workspace
   * init, tool construction, `makeGenieAgents`, agent loop, heartbeat
   * ticker) but skips:
   *   - `provideGuest` provisioning (root has direct host powers);
   *   - `parentPowers` directory tracking (no parent above the root);
   *   - the introducedNames `workspace-mount` plumbing (a future task
   *     can revive a host-level workspace mount if needed — for now
   *     the launcher passes the workspace path via `GENIE_WORKSPACE`).
   *
   * The "agent ready" announcement is emitted via `console.log` instead
   * of an `@host` mail so the readiness signal lands in the worker log;
   * `bottle.sh` watches `endo inbox` separately for operator-visible
   * readiness.
   *
   * @param {EndoHost} rootPowers - The daemon's root host agent.
   * @param {AgentConfig} config - Agent configuration sourced from env.
   */
  const runRootAgent = async (rootPowers, config) => {
    const agentName = config.name || 'main-genie';
    const workspaceDir = config.workspace;

    // Seed the workspace from the shipped template on first spawn.
    // Existing files are never overwritten.
    const didInit = await initWorkspace(workspaceDir);
    if (didInit) {
      console.log(
        `[genie:${agentName}] Workspace initialised from template: ${workspaceDir}`,
      );
    }

    // Cancellation kit — resolving `cancel` signals all sub-systems
    // (agent loop, heartbeat, etc.) to tear down.
    const { promise: cancelledP, resolve: cancel } = makePromiseKit();

    // ── Primordial mode ────────────────────────────────────────────
    // No model is configured (neither via env nor via persisted
    // config), so we skip `makeGenieAgents`, the heartbeat ticker,
    // and the full `runAgentLoop` wiring.  Instead we run a minimal
    // stub loop that acknowledges inbound messages with a fixed
    // placeholder — enough to prove the worker is alive without
    // pretending to have an LLM behind it.  Sub-task 94 replaces the
    // stub with the primordial automaton that can drive `/model`
    // (sub-task 95).
    if (config.mode === 'primordial') {
      console.log(
        `[genie:${agentName}] primordial mode — no model configured (workspace: ${workspaceDir}); \`/model\` arrives in sub-task 95`,
      );
      const stubLoopP = runPrimordialStubLoop({
        agentPowers: rootPowers,
        agentName,
        cancelledP,
      });
      stubLoopP.catch(err => {
        console.error(`[genie:${agentName}] Primordial loop error:`, err);
        cancel(undefined);
      });
      return;
    }

    const genieTools = buildTools(workspaceDir);

    // Shared side-channel map for delivering heartbeat tick objects
    // from runHeartbeatTicker to runAgentLoop without serializing
    // through daemon mail.
    /** @type {Map<string, IntervalTickMessage>} */
    const pendingHeartbeatTicks = new Map();
    const makeTickId = (() => {
      let value = 0;
      return () => {
        const id = `${value}`;
        value += 1;
        return id;
      };
    })();

    // Assemble the shared agent pack.  See `spawnAgent` for the same
    // wiring under a child-guest identity.
    const { piAgent, heartbeatAgent, observer, reflector } =
      await makeGenieAgents({
        hostname: 'endo-daemon',
        workspaceDir,
        tools: genieTools,
        config: {
          model: config.model || undefined,
          observerModel: config.observerModel || undefined,
          reflectorModel: config.reflectorModel || undefined,
        },
      });

    const observerModelLog =
      config.observerModel || config.model || '(default)';
    const reflectorModelLog =
      config.reflectorModel || config.model || '(default)';
    console.log(
      `[genie:${agentName}] Memory sub-agents: observer=${observerModelLog}, reflector=${reflectorModelLog}`,
    );

    // Start the message loop (fire-and-forget).  `agentPowers` is the
    // root host: heartbeat self-sends target `@self`, which resolves to
    // the very inbox this loop is following — no special routing.
    const agentLoopP = runAgentLoop({
      agentPowers: rootPowers,
      piAgent,
      heartbeatAgent,
      agentName,
      workspaceDir,
      cancelledP,
      pendingHeartbeatTicks,
      observer,
      reflector,
      genieTools,
    });

    // If the agent loop crashes, trigger cancellation so dependent
    // sub-systems (heartbeat, etc.) also tear down.
    agentLoopP.catch(err => {
      console.error(`[genie:${agentName}] Agent loop error:`, err);
      cancel(undefined);
    });

    // ── Heartbeat interval ─────────────────────────────────────────
    const heartbeatPeriodMs = config.heartbeatPeriod
      ? Number(config.heartbeatPeriod)
      : DEFAULT_HEARTBEAT_PERIOD_MS;
    const heartbeatTimeoutMs = config.heartbeatTimeout
      ? Number(config.heartbeatTimeout)
      : heartbeatPeriodMs / 2;
    await runHeartbeatTicker({
      agentGuest: rootPowers,
      agentName,
      workspaceDir,
      heartbeatPeriodMs,
      heartbeatTimeoutMs,
      cancelledP,
      pendingHeartbeatTicks,
      makeTickId,
    });

    // Announce readiness to the worker log (no `@host` mail — the
    // launcher / `bottle.sh` watch `endo inbox` separately).
    const heartbeatInfo =
      heartbeatPeriodMs > 0 ? `, heartbeat: ${heartbeatPeriodMs / 1000}s` : '';
    console.log(
      `[genie:${agentName}] agent ready (model: ${config.model}, workspace: ${workspaceDir}${heartbeatInfo})`,
    );
  };

  // ── Validate env and assemble root config ─────────────────────────
  // `GENIE_WORKSPACE` is still mandatory (the agent cannot run without
  // a persistent workspace) and is validated synchronously so a missing
  // value fails loudly in the worker log rather than as a silent boot
  // deadlock.  `GENIE_MODEL` used to be mandatory too, but primordial
  // mode (see TODO/92 § 1c) lets the genie boot without a configured
  // model so the operator can install one via `/model` (sub-task 95).
  const workspace = env.GENIE_WORKSPACE;
  if (!workspace) {
    throw new Error(
      'genie root agent: GENIE_WORKSPACE env var is required (set via setup.js launcher)',
    );
  }

  /**
   * Stub for the persisted model config reader.  The real
   * filesystem-backed loader lands in sub-task 96 (see TODO/92 § 1c);
   * until then it unconditionally returns `undefined` so the
   * precedence switch below falls through to primordial when no
   * env-var model is set.
   *
   * TODO(96): read the persisted config from the workspace.
   *
   * @returns {Promise<{ model?: string } | undefined>}
   */
  const loadConfig = async () => undefined;

  /**
   * Resolve the boot mode from the configured sources.  Precedence
   * (TODO/92 § 1c): env-var wins, then the persisted config written
   * by a prior `/model` run, then primordial as a last resort.  Kept
   * as one small switch block so the full rule is visible in a
   * single diff to audit.
   *
   * @returns {Promise<
   *   | { mode: 'piAgent', model: string }
   *   | { mode: 'primordial' }
   * >}
   */
  const resolveBootMode = async () => {
    if (env.GENIE_MODEL) {
      return { mode: 'piAgent', model: env.GENIE_MODEL };
    }
    const persisted = await loadConfig();
    if (persisted && persisted.model) {
      return { mode: 'piAgent', model: persisted.model };
    }
    return { mode: 'primordial' };
  };

  // Kick off the root agent (fire-and-forget within the daemon worker).
  // Wrapped in an async IIFE so `resolveBootMode` (which may do disk
  // I/O in sub-task 96) can be awaited without blocking `make()`'s
  // synchronous return of the Genie exo.
  (async () => {
    const resolved = await resolveBootMode();
    /** @type {AgentConfig} */
    const rootConfig = {
      mode: resolved.mode,
      model: resolved.mode === 'piAgent' ? resolved.model : undefined,
      workspace,
      name: env.GENIE_NAME || 'main-genie',
      agentDirectory: env.GENIE_AGENT_DIRECTORY || DEFAULT_AGENT_DIRECTORY,
      heartbeatPeriod: env.GENIE_HEARTBEAT_PERIOD || undefined,
      heartbeatTimeout: env.GENIE_HEARTBEAT_TIMEOUT || undefined,
      observerModel: env.GENIE_OBSERVER_MODEL || undefined,
      reflectorModel: env.GENIE_REFLECTOR_MODEL || undefined,
    };
    await runRootAgent(powers, rootConfig);
  })().catch(err => {
    console.error('[genie] Root agent error:', err);
  });

  return makeExo('Genie', GenieInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Genie AI agent (daemon root). Send messages to @self to interact; configuration is sourced from GENIE_* env vars at boot.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
