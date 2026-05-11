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
 * On startup the module sends a configuration form to `@host`.  Each
 * form submission provisions a **new** Endo guest via the host agent
 * and runs the genie agent loop under that guest's identity.  This
 * means "agent ready" messages and all subsequent replies originate
 * from the agent guest (e.g. `main-genie`), not from `setup-genie`.
 * The first agent defaults to `main-genie`; subsequent form
 * submissions can specify a custom name.
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
} from './src/index.js';

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
/** @import { EndoGuest, EndoHost, Package, StampedMessage } from '@endo/daemon' */
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
 * Creates the Genie daemon guest.
 *
 * Sends a configuration form to `@host`.  Each form submission
 * provisions a **new** Endo guest via the host agent and runs the
 * genie agent loop under that guest's identity.  The first agent
 * created is named `main-genie` so the user can interact with it
 * immediately; subsequent submissions can specify a custom name.
 *
 * @param {EndoGuest} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<object> | object | undefined} _context - Context (unused for now)
 * @returns {object} The Genie exo object
 */
export const make = (guestPowers, _context) => {
  const powers = guestPowers;

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
   * @property {string} model
   * @property {string} workspace
   * @property {string} [name]
   * @property {string} [agentDirectory]
   * @property {string} [heartbeatPeriod]
   * @property {string} [heartbeatTimeout]
   * @property {string} [observerModel] - Model string for the observer
   *   agent.  Defaults to the main chat model.  A fast,
   *   non-reasoning model is recommended.
   * @property {string} [reflectorModel] - Model string for the reflector
   *   agent.  Defaults to the main chat model.  A reasoning-capable
   *   model is recommended.
   */

  /**
   * Process a single inbound message by running a genie chat round and
   * relaying events back to the sender via daemon mail.
   *
   * @param {EndoGuest} agentPowers - The agent guest's powers (for send/reply)
   * @param {object} piAgent - The PiAgent instance
   * @param {object} inboxMessage - The inbound daemon message
   * @param {bigint} inboxMessage.number - Message number for reply/dismiss
   * @param {string[]} inboxMessage.strings - Text fragments of the message
   * @param {string} inboxMessage.from - Sender formula ID
   */
  const processMessage = async (agentPowers, piAgent, inboxMessage) => {
    await Promise.resolve();

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
   * @param {EndoGuest} agentPowers
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
    await Promise.resolve();

    /** @param {Package} m */
    const getHeartbeatTick = m => {
      const {
        strings: [first = ''],
      } = m;
      const head = first.trim().toLowerCase();
      const id = head.startsWith('/heartbeat')
        ? (head.split(/\s+/)[1] ?? '')
        : '';
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
        he => {
          heartbeatEvent = he;
        },
        runHeartbeat({
          workspaceDir,
          piAgent,
          // NOTE now = Date.now,
        }),
      )) {
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
      const status = /** @type {HeartbeatEvent} */ (heartbeatEvent).status;
      if (status === HeartbeatStatus.Ok) {
        console.log(`[genie:${agentName}] Heartbeat done`);
      } else {
        console.error(
          `[genie:${agentName}] Heartbeat done, not ok:`,
          heartbeatEvent,
        );
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
   * @param {EndoGuest} opts.agentGuest - The agent guest's EndoGuest powers
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
    await Promise.resolve();

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
        case 'heartbeat':
          {
            const { tickNumber, scheduledAt, actualAt, missedTicks } = tick;

            // Generate a correlation ID and store the tick in the
            // side-channel map so runAgentLoop can retrieve it.
            const tickID = `hb-${makeTickId()}`;
            pendingHeartbeatTicks.set(tickID, tick);

            console.info(
              `[genie:${agentName}] Sending HEARTBEAT message (${tickID}):`,
              {
                tickNumber,
                scheduleLag: actualAt - scheduledAt,
                missedTicks,
              },
            );

            // Fire-and-forget: deliver the heartbeat as a daemon mail
            // message to ourselves.  The message loop detects and handles
            // `/heartbeat` strings with an optional tick correlation id.
            E(agentGuest)
              .send(`@self`, [`/heartbeat ${tickID}`], [], [])
              .catch(err => {
                console.error(
                  `[genie:${agentName}] Failed to send heartbeat message:`,
                  err.message,
                );
                // Clean up the map entry and resolve the tick to
                // prevent the scheduler from stalling.
                pendingHeartbeatTicks.delete(tickID);
                tick.tickResponse.resolve();
              });
          }
          break;

        default: {
          console.warn(`[genie:${agentName}] Unknown scheduler tick:`, tick);
        }
      }
    };

    try {
      const { scheduler, schedulerControl: heartbeatControl } =
        await makeIntervalScheduler({
          persistDir: intervalsDir,
          onTick,
        });

      // Tear down the scheduler when the agent is cancelled.
      cancelledP.then(() => heartbeatControl.revoke());

      await scheduler.makeInterval('heartbeat', heartbeatPeriodMs, {
        tickTimeoutMs: heartbeatTimeoutMs,
      });
      console.log(
        `[genie:${agentName}] Heartbeat scheduled: period=${heartbeatPeriodMs}ms, timeout=${heartbeatTimeoutMs}ms`,
      );
    } catch (err) {
      console.error(
        `[genie:${agentName}] Failed to create heartbeat scheduler:`,
        /** @type {Error} */ (err).message,
      );
    }
  };

  /**
   * Run the message processing loop for a single agent guest.
   *
   * Follows the agent guest's inbox and dispatches each inbound message
   * to processMessage, using the agent guest's powers so that replies
   * originate from the agent's identity (not setup-genie).
   *
   * Heartbeat messages (type `'heartbeat'`) are detected and coalesced:
   * if multiple heartbeat messages have accumulated, only one heartbeat
   * round runs and all stacked heartbeat ticks are resolved.
   *
   * @param {object} opts
   * @param {EndoGuest} opts.agentPowers - The agent guest's EndoGuest powers
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
      //
      // eslint-disable-next-line require-yield
      async *renderEvents(events) {
        for await (const _ of events) {
          // TODO once we have progressive message edits
        }
      },
      listToolNames: () => toolNames.slice(),
      listHelpLines: () =>
        formatHelpLines({
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
        const {
          strings: [first = ''],
        } = m;
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
    const cancelSentinel = cancelledP.then(cancelled => ({ cancelled }));

    /** @returns {AsyncGenerator<InboundPrompt>} */
    async function* daemonPrompts() {
      await Promise.resolve();

      for (;;) {
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
          console.warn(
            `[genie:${agentName}] Unhandled message #${message.number} (type: ${message.type})`,
          );
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
        await Promise.resolve();
        // `InboundPromptId` is `string | number | bigint` for the
        // generic loop contract, but the daemon adapter always threads
        // `message.number` (a bigint) through `id`, so narrowing here
        // is sound.
        const messageNumber = /** @type {bigint} */ (promptId);
        for (const chunk of chunks) {
          if (chunk) {
            await E(agentPowers).reply(messageNumber, [chunk], [], []);
          }
        }
      },
      dismiss: async promptId => {
        await Promise.resolve();
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
        // eslint-disable-next-line require-yield
        async *runUserPrompt(prompt) {
          await Promise.resolve();

          const message = /** @type {Package & StampedMessage} */ (prompt.raw);
          console.log(
            `[genie:${agentName}] New message #${prompt.id} (type: ${message.type})`,
          );

          // Reset the observer idle timer on each inbound message so
          // opportunistic observation only fires after a quiet period.
          if (observer) {
            observer.resetIdleTimer();
          }

          try {
            await processMessage(agentPowers, piAgent, message);
          } catch (err) {
            const errorMessage =
              /** @type {Error} */ (err).message || String(err);
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
                /** @type {Error} */ (err).message || String(err),
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
          await Promise.resolve();
          const errorMessage =
            /** @type {Error} */ (err).message || String(err);
          console.error(
            `[genie:${agentName}] Dispatch error for #${prompt.id}:`,
            errorMessage,
          );
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
    await Promise.resolve();

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
        return `${(value += 1)}`;
      };
    })();

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

    // Start the message loop (fire-and-forget).
    const agentLoopP = runAgentLoop({
      agentPowers: agentGuest,
      piAgent,
      heartbeatAgent,
      agentName,
      workspaceDir,
      cancelledP,
      pendingHeartbeatTicks,
      genieTools,
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
      heartbeatPeriodMs > 0 ? `, heartbeat: ${heartbeatPeriodMs / 1000}s` : '';
    const readyMess = `agent ready (model: ${config.model}, workspace: ${workspaceDir}${heartbeatInfo})`;
    await E(agentGuest).send('@host', [`Genie ${readyMess}.`], [], []);
    console.log(`[genie:${agentName}] ${readyMess}`);
  };

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
    await Promise.resolve();

    const agentDirName = config.agentDirectory || DEFAULT_AGENT_DIRECTORY;
    if (!(await E(parentPowers).has(agentDirName))) {
      return [];
    }
    const result = await E(parentPowers).list(agentDirName);
    return /** @type {string[]} */ (result);
  };
  harden(listChildAgents);

  /**
   * Main loop — sends a configuration form to `@host`, waits for each
   * submission, provisions a new Endo guest for each agent, and loops
   * back to accept further submissions.
   */
  const runLoop = async () => {
    // Resolve the host agent for provisioning new guests.
    const hostAgent = /** @type {FarRef<EndoHost>} */ (
      await E(powers).lookup('host-agent')
    );

    // Send the configuration form to HOST.
    await E(powers).form(
      '@host',
      'Configure Genie agent',
      harden([
        {
          name: 'name',
          label: 'Agent name',
          example: 'main-genie',
        },
        {
          name: 'agentDirectory',
          label: 'Agent directory name (for child-agent tracking)',
          default: 'genie',
        },
        {
          name: 'model',
          label: 'Model',
          default: 'ollama/llama3.2',
        },
        {
          name: 'workspace',
          label: 'Workspace directory',
          example: '/home/user/project',
        },
        {
          name: 'heartbeatPeriod',
          label: 'Heartbeat period (ms, 0 to disable, default: 30 minutes)',
          default: '1800000',
        },
        {
          name: 'heartbeatTimeout',
          label: 'Heartbeat timeout (ms, default: period/2)',
          example: '900000',
          default: '',
        },
        {
          name: 'observerModel',
          label: 'Observer model (default: same as chat model)',
          example: 'ollama/llama3.2',
          default: '',
        },
        {
          name: 'reflectorModel',
          label: 'Reflector model (default: same as chat model)',
          example: 'anthropic/claude-sonnet',
          default: '',
        },
      ]),
    );

    const selfId = await E(powers).locate('@self');

    // Pre-scan existing messages to find our latest form messageId so that
    // old value messages (from prior sessions) that reply to an earlier form
    // are not accidentally matched when the iterator replays history.
    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    // -----------------------------------------------------------------------
    // Accept form submissions and spawn agent guests
    // -----------------------------------------------------------------------

    for await (const msg of makeRefIterator(E(powers).followMessages())) {
      // Capture the form's messageId from our own outbound message.
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
        continue;
      }

      // Only accept value messages that reply to our form.
      if (msg.type !== 'value') continue;
      if (msg.replyTo !== formMessageId) continue;

      try {
        const config = /** @type {AgentConfig} */ (
          await E(powers).lookupById(msg.valueId)
        );
        const { name: agentName = 'main-genie' } = config;

        console.log(
          `[genie] Configuration received: name=${agentName}, model=${config.model}, workspace=${config.workspace}`,
        );

        // Delegate existence authority to the endo pet namespace.
        // spawnAgent handles idempotent guest creation (reuses
        // existing guests on restart), so we always call through.
        await spawnAgent(hostAgent, agentName, config);

        await E(powers).reply(
          msg.number,
          [`Agent "${agentName}" is now running.`],
          [],
          [],
        );
      } catch (err) {
        console.error('[genie] Form submission error:', err);
        try {
          await E(powers).reply(
            msg.number,
            [`Error creating agent: ${err?.message || err}`],
            [],
            [],
          );
        } catch {
          // Best-effort reply.
        }
      }
    }
  };

  // Kick off the main loop (fire-and-forget within the daemon worker).
  runLoop().catch(err => {
    console.error('[genie] Main loop error:', err);
  });

  return makeExo('Genie', GenieInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Genie AI agent. Submit the configuration form, then send messages to interact.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
