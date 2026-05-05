// @ts-check
/* global process, setTimeout */
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

import { makeError, q, X } from '@endo/errors';
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
  makePrimordialAutomaton,
  makeSpecialsDispatcher,
  PLUGIN_DEFAULT_INCLUDE,
  runAgentRound,
  runGenieLoop,
} from './src/index.js';
import {
  clearConfig as clearPersistedConfig,
  loadConfig as loadPersistedConfig,
  saveConfig as savePersistedConfig,
} from './src/primordial/persistence.js';
import {
  SANDBOX_FACTORY_NAME,
  SANDBOX_SLICE_NAME,
  WORKSPACE_MOUNT_NAME,
} from './src/pet-names.js';

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
   * @param {import('./src/tools/registry.js').SandboxSlice} [slice]
   *   - Optional persistent workspace `SandboxHandle` minted by
   *     `runRootAgent` per `TODO/34_endo_genie_sandbox_main_wiring.md`.
   *     Threaded into `buildGenieTools` so sub-task 35
   *     (`TODO/35_endo_genie_sandbox_tool_spawn.md`) can route
   *     `bash` / `exec` / `git` spawns through `E(slice).spawn(...)`
   *     rather than the host `child_process.spawn`.  The legacy
   *     `spawnAgent` path leaves it absent (its child guests do not
   *     yet have a per-child slice — that's the 23 / sub-agent
   *     follow-up); the `runRootAgent` cold-boot path passes the
   *     `main-genie-sandbox` handle minted at boot.
   */
  const buildTools = (workspaceDir, slice) => {
    const searchBackend = makeFTS5Backend({ dbDir: workspaceDir });
    return buildGenieTools({
      workspaceDir,
      include: PLUGIN_DEFAULT_INCLUDE,
      searchBackend,
      slice,
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
   * @property {string} [reflectorModel] - Model string for the reflector
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
   * In primordial mode (sub-task 94 of TODO/92_genie_primordial.md) the
   * piAgent / heartbeat / observer / reflector pack is absent —
   * `state.mode === 'primordial'` instructs the IO adapter to classify
   * plain-text prompts as `kind: 'primordial'` so they flow through the
   * dedicated `runPrimordial` handler below, and specials keep flowing
   * through the dispatcher (so `/help` and `/tools` work even without a
   * model).  Sub-task 97's `activatePiAgent` populates the per-agent
   * pieces on `state` in place (`state.piAgent`, `state.heartbeatAgent`,
   * etc.), so the dispatcher and per-prompt handlers read through to
   * the freshly-built pack the moment the hand-off completes — no
   * loop restart required.
   *
   * @param {object} opts
   * @param {EndoAgent} opts.agentPowers - The agent's mail-capable powers
   *   (root genie passes the daemon host; future child agents would
   *   pass a provisioned guest)
   * @param {string} opts.agentName - Display name for logging
   * @param {string} opts.workspaceDir - Agent workspace directory
   * @param {Promise<any>} opts.cancelledP - Resolves when the agent is cancelled
   * @param {import('./src/primordial/index.js').PrimordialState} opts.state
   *   - Shared mode-flag + agent-pack carrier.  The IO adapter reads
   *     `state.mode` when classifying inbound prompts so primordial-mode
   *     plain-text goes through the automaton; the per-prompt handlers
   *     read `state.piAgent` / `state.heartbeatAgent` /
   *     `state.observer` / `state.reflector` /
   *     `state.pendingHeartbeatTicks` lazily so sub-task 97's hand-off
   *     can stamp them in place.
   * @param {import('./src/primordial/model-handler.js').ModelHandlerPersistence} [opts.persistence]
   *   - Optional persistence hook threaded through to
   *     `makeBuiltinSpecials` so `/model commit` lands the draft on
   *     disk.  When absent, `/model commit` falls back to its labelled
   *     stub reply.
   * @param {import('./src/primordial/index.js').PrimordialAutomaton} [opts.primordialAutomaton]
   *   - Automaton consulted by the `runPrimordial` handler.  Required
   *     whenever the worker may see `kind: 'primordial'` prompts; the
   *     piAgent-only boot path leaves it unset, which is safe because
   *     `state.mode === 'piAgent'` keeps the classifier on the normal
   *     user-prompt path.
   */
  const runAgentLoop = async ({
    agentPowers,
    agentName,
    workspaceDir,
    cancelledP,
    state,
    primordialAutomaton,
    persistence,
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
    //
    // The agent pack lives on `state` rather than as constructor-time
    // params.  In primordial mode `state.piAgent` / `state.observer` /
    // `state.reflector` / `state.genieTools` are absent — we mount the
    // same specials set so `/help` still works and `/tools` simply
    // reports an empty list.  Sub-task 97's `activatePiAgent` populates
    // those fields in place during the primordial → piAgent hand-off,
    // and because `makeBuiltinSpecials` reads `agents.X` lazily, the
    // existing dispatcher picks them up without needing a rebuild.

    /**
     * Build a getter-backed view onto the agent pack.  Each property
     * reads through to `state.<X>` at access time so the dispatcher's
     * built-in handlers see the freshly-populated values after
     * `activatePiAgent` lands.
     */
    const agentsRef = harden({
      get piAgent() {
        return state.piAgent;
      },
      get heartbeatAgent() {
        return state.heartbeatAgent;
      },
      get observer() {
        return state.observer;
      },
      get reflector() {
        return state.reflector;
      },
    });

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
      listToolNames: () =>
        // `state.genieTools` is populated by `activatePiAgent`; before
        // activation, report an empty list so `/tools` answers honestly
        // without crashing.
        state.genieTools ? Object.keys(state.genieTools.tools) : [],
      listHelpLines: () =>
        formatHelpLines({
          prefix: '/',
          // Only the handlers actually mounted below; `/heartbeat`
          // remains a system self-send, so it is intentionally absent.
          // `/model` is mounted in both primordial and piAgent modes
          // (sub-task 95 of TODO/92_genie_primordial.md) so operators can
          // inspect / stage / commit a model configuration from either
          // side of the hand-off.
          commands: ['help', 'tools', 'observe', 'reflect', 'model'],
        }),
    });

    const allBuiltins = makeBuiltinSpecials({
      agents: agentsRef,
      workspaceDir,
      io: dispatcherIo,
      state,
      ...(persistence ? { persistence } : {}),
    });

    // Mount only the user-facing built-ins; `/heartbeat` stays with
    // the system handler below.  `/model` is the sub-task 95 entry
    // point and is mounted in both primordial and piAgent modes —
    // `makeBuiltinSpecials` picked up `state` above, so the handler
    // has access to the shared draft / committed model carriers.
    const dispatcher = makeSpecialsDispatcher({
      prefix: '/',
      handlers: harden({
        observe: allBuiltins.observe,
        reflect: allBuiltins.reflect,
        help: allBuiltins.help,
        tools: allBuiltins.tools,
        model: allBuiltins.model,
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
     *
     * Only meaningful when a heartbeat ticker is configured (piAgent
     * mode).  In primordial mode no heartbeat self-sends are scheduled
     * and no heartbeat prompts reach the runner anyway, so this helper
     * is never invoked.
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
        } else if (state.mode === 'primordial') {
          // No model configured yet — route plain-text prompts to the
          // primordial automaton (sub-task 94 of TODO/92_genie_primordial.md).
          // Specials still win because the `dispatcher.isSpecial` branch
          // above is evaluated first.
          kind = 'primordial';
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
      // The `agents` value passed to `runGenieLoop` is reserved for
      // `afterDispatch` hooks that touch sub-agents directly; the
      // runner itself never destructures it, so wiring through the
      // same lazy `agentsRef` view (whose getters read from `state`)
      // keeps the post-activation pack visible without duplicating
      // the proxy.
      agents: agentsRef,
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

          // Read the agent pack from `state` rather than closure-capturing
          // it at construction time so the primordial → piAgent hand-off
          // (sub-task 97) can populate `state.piAgent` in place and have
          // the very next user message land on the freshly-built pack.
          const livePiAgent = state.piAgent;
          if (!livePiAgent) {
            console.warn(
              `[genie:${agentName}] user message #${prompt.id} arrived without a piAgent (state.mode=${state.mode}); dropping`,
            );
            try {
              await E(agentPowers).reply(
                /** @type {bigint} */ (prompt.id),
                [
                  '(no model configured yet — try /model list to install one)',
                ],
                [],
                [],
              );
            } catch {
              // best-effort
            }
            return;
          }

          // Reset the observer idle timer on each inbound message so
          // opportunistic observation only fires after a quiet period.
          if (state.observer) {
            state.observer.resetIdleTimer();
          }

          try {
            await processMessage(agentPowers, livePiAgent, message);
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
          // The heartbeat ticker is only ever started by `activatePiAgent`
          // (which also populates `state.heartbeatAgent` and
          // `state.pendingHeartbeatTicks`), so reaching this branch
          // without those fields means a `/heartbeat` message slipped
          // through during primordial mode — drop it with a log line
          // rather than crashing on `undefined.set` / null deref.
          const liveHeartbeatAgent = state.heartbeatAgent;
          const livePendingHeartbeatTicks = state.pendingHeartbeatTicks;
          if (!liveHeartbeatAgent || !livePendingHeartbeatTicks) {
            console.warn(
              `[genie:${agentName}] heartbeat prompt #${prompt.id} dropped (state.mode=${state.mode}, heartbeat ticker not active)`,
            );
            return;
          }
          const extraHeartbeats = await drainPendingHeartbeats();
          try {
            await processHeartbeat(
              agentPowers,
              liveHeartbeatAgent,
              agentName,
              workspaceDir,
              message,
              livePendingHeartbeatTicks,
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
          if (state.reflector) {
            try {
              const triggered = await state.reflector.checkAndRun();
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
         * Primordial-mode handler — sub-task 94 of
         * `TODO/92_genie_primordial.md`.
         *
         * Reached only when `state.mode === 'primordial'` (the IO adapter
         * above classifies plain-text prompts as `kind: 'primordial'`
         * only in that case), so piAgent-mode runs never take this
         * branch and the piAgent behaviour stays byte-equivalent.
         *
         * Delegates to `primordialAutomaton.processPrompt`, which yields
         * a single "not configured yet" chunk pointing the operator at
         * `/help` and `/model list`.  The runner drains the chunks via
         * the usual `drainChunks` → `io.reply` path so the sender gets
         * one mail reply per yielded chunk — matching the daemon's
         * existing reply cadence for slash-command output.
         *
         * If the automaton is not wired (defensive: the piAgent boot
         * path intentionally leaves it unset), drop the prompt with a
         * log line rather than throwing — `runGenieLoop` would swallow
         * an uncaught throw here anyway via `onError`, but a targeted
         * log makes a misconfiguration easier to spot.
         *
         * @param {InboundPrompt} prompt
         */
        runPrimordial: async function* runPrimordialHandler(prompt) {
          if (!primordialAutomaton) {
            console.warn(
              `[genie:${agentName}] primordial prompt #${prompt.id} dropped (no automaton wired)`,
            );
            return;
          }
          yield* primordialAutomaton.processPrompt(prompt.text);
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
        const liveObserver = state.observer;
        const livePiAgent = state.piAgent;
        if (liveObserver && livePiAgent) {
          liveObserver.check(livePiAgent);
          liveObserver.scheduleIdle(livePiAgent);
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
    // Mirrors `setup.js`'s mapping so child agents see the same names
    // (`workspace`, `sandboxes`) regardless of whether they were
    // spawned by `setup-genie` directly or forked from a parent agent.
    /** @type {Record<string, string>} */
    const introducedNames = {};
    if (await E(hostAgent).has(WORKSPACE_MOUNT_NAME)) {
      introducedNames[WORKSPACE_MOUNT_NAME] = 'workspace';
    }
    if (await E(hostAgent).has('sandbox-factory')) {
      introducedNames['sandbox-factory'] = 'sandboxes';
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
    /** @type {import('./src/primordial/index.js').PrimordialState} */
    const childState = {
      mode: 'piAgent',
      activate: async () => {},
      piAgent,
      heartbeatAgent,
      observer,
      reflector,
      genieTools,
      pendingHeartbeatTicks,
    };
    const agentLoopP = runAgentLoop({
      agentPowers: agentGuest,
      agentName,
      workspaceDir,
      cancelledP,
      state: childState,
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

    // Resolve the workspace mount and sandbox factory.  Both are
    // optional during the rollout of TODO/40_genie_sandbox.md: the
    // legacy "workspace = host cwd, no slice" code path is still
    // exercised by deployments that did not set `GENIE_WORKSPACE`
    // and have not yet adopted the sandbox plugin.  Surface a
    // structured-error pair via the local debug log so partial
    // rollouts are visible instead of silently falling back.
    /** @type {unknown} */
    let workspaceMount;
    try {
      workspaceMount = await E(powers).lookup('workspace');
    } catch (err) {
      const message = /** @type {Error} */ (err).message || String(err);
      console.warn(
        `[genie] No 'workspace' cap (${message}); falling back to direct host-cwd workspace.`,
      );
      // Fail fast in strict mode so misconfigurations are caught
      // early, but only after the parallel sandboxes lookup runs.
      workspaceMount = makeError(
        X`No 'workspace' cap introduced; expected setup.js to mint and introduce a Mount cap (see ${q('GENIE_WORKSPACE')}).`,
      );
    }
    /** @type {unknown} */
    let sandboxFactory;
    try {
      sandboxFactory = await E(powers).lookup('sandboxes');
    } catch (err) {
      const message = /** @type {Error} */ (err).message || String(err);
      console.warn(
        `[genie] No 'sandboxes' cap (${message}); falling back to direct host spawn.`,
      );
      sandboxFactory = makeError(
        X`No 'sandboxes' cap introduced; expected setup.js to mint a SandboxFactory via @endo/sandbox.`,
      );
    }
    // The lookups land here so the rollout-tracking
    // TODOs in 43/44/46 can wire them through to spawnAgent.
    void workspaceMount;
    void sandboxFactory;

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

    // ── Sandbox slice resolution ──────────────────────────────────
    // Per `TODO/34_endo_genie_sandbox_main_wiring.md` (Decision 1 of
    // `TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`), the
    // root genie mints its workspace `SandboxHandle` main-side from
    // capabilities the launcher (`setup.js`) pinned in the host pet
    // store: `sandbox-factory` (the `@endo/sandbox` `SandboxFactory`)
    // and `workspace-mount` (the `Mount` covering `GENIE_WORKSPACE`).
    //
    // `makePersistent(name, opts)` (sub-task 33) records the resolved
    // spec on disk and returns the same handle on re-deref, so a
    // daemon restart reincarnates the slice without operator
    // intervention.  We pin under `main-genie-sandbox`
    // (`SANDBOX_SLICE_NAME`).
    //
    // Both lookups are tolerant: a missing capability (e.g. the
    // `self-boot.test.js` harness, which calls `makeUnconfined`
    // directly without `setup.js`, or a deployment that opted out of
    // the sandbox plugin) downgrades to `slice = undefined`.  The tool
    // registry already documents that consumers must handle the
    // missing-slice case; sub-task 35 will pick the policy
    // (host-spawn fallback vs hard refusal) at the `makeCommandTool`
    // chokepoint.
    /** @type {import('./src/tools/registry.js').SandboxSlice | undefined} */
    let workspaceSlice;
    if (
      (await E(rootPowers).has(SANDBOX_FACTORY_NAME)) &&
      (await E(rootPowers).has(WORKSPACE_MOUNT_NAME))
    ) {
      try {
        const factory = await E(rootPowers).lookup(SANDBOX_FACTORY_NAME);
        const workspaceMount = await E(rootPowers).lookup(
          WORKSPACE_MOUNT_NAME,
        );
        workspaceSlice =
          /** @type {import('./src/tools/registry.js').SandboxSlice} */ (
            await E(factory).makePersistent(
              SANDBOX_SLICE_NAME,
              harden({
                rootfs: { kind: 'host-bind' },
                mounts: [
                  {
                    cap: workspaceMount,
                    innerPath: '/workspace',
                    mode: 'rw',
                  },
                ],
                network: 'private',
                backend: 'auto',
                // Slice-internal env / cwd resolution
                // (`TODO/36_endo_genie_sandbox_workspace_path.md`).
                // Bake `GENIE_WORKSPACE=/workspace` and `cwd=/workspace`
                // into the slice's construction-time spec so every
                // tool spawn that routes through `E(slice).spawn(...)`
                // — bash / exec / git via
                // `packages/genie/src/tools/command.js` — sees the
                // slice-internal mount path rather than the operator-
                // supplied host path.  The bwrap driver renders these
                // as `--setenv GENIE_WORKSPACE /workspace` and
                // `--chdir /workspace` (see
                // `packages/sandbox/src/drivers/bwrap.js`
                // `assembleSliceArgv`); per-spawn `env` / `cwd`
                // overrides from `command.js` layer on top.
                env: { GENIE_WORKSPACE: '/workspace' },
                cwd: '/workspace',
              }),
            )
          );
        // ── In-process `GENIE_WORKSPACE` rewrite ──────────────────────
        // After slice mint, flip `process.env.GENIE_WORKSPACE` to the
        // slice-internal path so any future host-side reader of
        // `process.env.GENIE_WORKSPACE` (defence-in-depth: today no
        // genie source path consults it, but third-party code or a
        // future tool might) sees the same view a spawn-through-slice
        // child would.  The on-host call sites that actually do touch
        // the host filesystem — `initWorkspace`, `loadPersistedConfig`,
        // `savePersistedConfig`, `makeFTS5Backend`, `makeFileTools`,
        // `makeMemoryTools` — all read from the captured `workspaceDir`
        // local (sourced from the launcher's `env` snapshot via
        // `config.workspace`), so they keep their host view across
        // this rewrite.  Audited per
        // `TODO/36_endo_genie_sandbox_workspace_path.md`; missing-
        // slice path below leaves `process.env.GENIE_WORKSPACE`
        // untouched so the host-spawn fallback in
        // `tools/command.js`'s `...process.env` propagation keeps
        // pointing at the host path.
        process.env.GENIE_WORKSPACE = '/workspace';
        console.log(
          `[genie:${agentName}] Workspace sandbox minted (${SANDBOX_SLICE_NAME}, network: private, backend: auto)`,
        );
      } catch (err) {
        // Mint failure is best-effort: the bottle does not yet have a
        // hard contract that tools must run through the slice (sub-
        // task 35 will tighten that).  Log loudly so an operator on a
        // mis-configured host (no bwrap / no podman / kernel feature
        // floor unmet) can correlate the warning with the
        // `listBackends()` probe output.
        console.warn(
          `[genie:${agentName}] Failed to mint workspace sandbox slice (${SANDBOX_SLICE_NAME}); proceeding without slice. Reason: ${
            /** @type {Error} */ (err).message || String(err)
          }`,
        );
        workspaceSlice = undefined;
      }
    } else {
      // Missing-capability path is expected on the daemon self-boot
      // test (which bypasses `setup.js`) and on deployments that opt
      // out of the sandbox plugin.  Log at INFO so the trace remains
      // useful without alarming an operator who deliberately skipped
      // setup.js's sandbox-factory registration.
      console.log(
        `[genie:${agentName}] Sandbox capabilities not pinned (sandbox-factory present: ${await E(rootPowers).has(SANDBOX_FACTORY_NAME)}, workspace-mount present: ${await E(rootPowers).has(WORKSPACE_MOUNT_NAME)}) — proceeding without slice.`,
      );
    }

    // Cancellation kit — resolving `cancel` signals all sub-systems
    // (agent loop, heartbeat, etc.) to tear down.
    const { promise: cancelledP, resolve: cancel } = makePromiseKit();

    // Shared side-channel map for delivering heartbeat tick objects
    // from `runHeartbeatTicker` to `runAgentLoop` without serializing
    // through daemon mail.  Created once at boot and stamped into
    // `state.pendingHeartbeatTicks` during `activatePiAgent` so both
    // the cold-boot piAgent path and the primordial → piAgent hand-off
    // share a single map.
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

    /**
     * Build the agent pack, stamp it into `state`, start the
     * heartbeat ticker, and emit the backwards-compatible "agent
     * ready" log line.
     *
     * Shared by the cold-boot piAgent path (`config.mode ===
     * 'piAgent'` at `make()` time) and the primordial `/model commit`
     * hand-off (called via `state.activate` from the model-handler
     * commit branch).  The caller is responsible for picking the
     * right model string — for the cold-boot path it comes verbatim
     * from `config.model`; for the hand-off it is derived from the
     * freshly-persisted `<workspace>/.genie/config.json`.
     *
     * Order of operations matches TODO/92 § 3e:
     *   1. Construct the agent pack (`makeGenieAgents`).
     *   2. Populate `state.piAgent` / `state.heartbeatAgent` / … so
     *      the lazy `agentsRef` in `runAgentLoop` and the `state.X`
     *      reads in `runUserPrompt` / `runHeartbeat` see the new
     *      values.
     *   3. Flip `state.mode = 'piAgent'` so the IO classifier stops
     *      routing plain-text prompts through the primordial
     *      automaton.
     *   4. Start the heartbeat ticker (no-op when
     *      `heartbeatPeriodMs <= 0`).
     *   5. Emit the `[genie:<name>] agent ready (model: …)` line that
     *      `self-boot.test.js`'s log-scraper greps for.
     *
     * @param {object} options
     * @param {string} options.modelString
     *   - `<provider>/<modelId>` to pass to `makeGenieAgents`.
     * @param {import('./src/primordial/index.js').PrimordialState} options.state
     *   - The shared mode/agent-pack carrier.  Mutated in place.
     */
    const activatePiAgent = async ({ modelString, state }) => {
      // `workspaceSlice` is captured from the surrounding
      // `runRootAgent` closure (minted above the mode branch so the
      // primordial → piAgent hand-off and the cold-boot piAgent path
      // share a single handle).
      const genieTools = buildTools(workspaceDir, workspaceSlice);

      // Assemble the shared agent pack.  See `spawnAgent` for the
      // same wiring under a child-guest identity.
      const { piAgent, heartbeatAgent, observer, reflector } =
        await makeGenieAgents({
          hostname: 'endo-daemon',
          workspaceDir,
          tools: genieTools,
          config: {
            model: modelString || undefined,
            observerModel: config.observerModel || undefined,
            reflectorModel: config.reflectorModel || undefined,
          },
        });

      const observerModelLog =
        config.observerModel || modelString || '(default)';
      const reflectorModelLog =
        config.reflectorModel || modelString || '(default)';
      console.log(
        `[genie:${agentName}] Memory sub-agents: observer=${observerModelLog}, reflector=${reflectorModelLog}`,
      );

      // Stamp the freshly-built pack into `state` BEFORE flipping
      // `state.mode` so any in-flight `runUserPrompt` reading
      // `state.piAgent` after the mode flip sees a populated pack.
      state.piAgent = piAgent;
      state.heartbeatAgent = heartbeatAgent;
      state.observer = observer;
      state.reflector = reflector;
      state.genieTools = genieTools;
      state.pendingHeartbeatTicks = pendingHeartbeatTicks;
      state.mode = 'piAgent';

      // ── Heartbeat interval ───────────────────────────────────────
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
      // The exact phrasing is part of the test contract: see
      // `self-boot.test.js`'s `[genie:main-genie] agent ready` matcher.
      const heartbeatInfo =
        heartbeatPeriodMs > 0
          ? `, heartbeat: ${heartbeatPeriodMs / 1000}s`
          : '';
      console.log(
        `[genie:${agentName}] agent ready (model: ${modelString}, workspace: ${workspaceDir}${heartbeatInfo})`,
      );
    };

    /**
     * Schedule a worker exit a short tick after `/model commit` in
     * piAgent mode so the chunks yielded by the commit handler get a
     * chance to flush through CapTP before the worker process dies.
     * The daemon reincarnates the worker on the next inbound message,
     * which loads the freshly-persisted config via the boot-time
     * precedence resolver.
     */
    const scheduleWorkerRestart = async () => {
      console.log(
        `[genie:${agentName}] /model commit triggered worker exit; daemon will reincarnate on next message`,
      );
      // Allow ~200ms for any in-flight CapTP traffic (the
      // "Configuration saved" / "Restart required" replies the commit
      // handler just yielded) to flush before we tear the process
      // down.  An immediate `process.exit(0)` would race those
      // replies and leave the operator staring at a half-sent reply
      // chain.
      // eslint-disable-next-line no-undef
      setTimeout(() => process.exit(0), 200);
    };

    if (config.mode === 'primordial') {
      console.log(
        `[genie:${agentName}] primordial mode — no model configured (workspace: ${workspaceDir}); use \`/model\` to install one`,
      );

      // Persistence hook for the `/model` commit subcommand.  In
      // primordial mode the post-commit hand-off is wired via
      // `state.activate` below; in piAgent mode the same hook lands
      // here too (after the worker reincarnates) and `requestRestart`
      // takes over the post-commit work.
      const persistence = harden({
        /** @param {import('./src/primordial/index.js').ModelDraft} draft */
        saveConfig: async draft => {
          await savePersistedConfig(workspaceDir, {
            version: 1,
            model: {
              provider: draft.provider,
              modelId: draft.modelId,
              credentials: { ...(draft.credentials || {}) },
              options: { ...(draft.options || {}) },
            },
          });
        },
      });

      // One-shot promise guard: concurrent `/model commit` calls
      // (e.g. operator double-tapping the slash command) await the
      // same activation promise instead of racing two
      // `makeGenieAgents` constructions.  On failure the promise is
      // rejected once and `activationKit` is reset so a subsequent
      // commit can retry.
      /** @type {ReturnType<typeof makePromiseKit> | undefined} */
      let activationKit;

      /** @type {import('./src/primordial/index.js').PrimordialState} */
      const primordialState = {
        mode: 'primordial',
        activate: async () => {
          if (activationKit) return activationKit.promise;
          activationKit = makePromiseKit();
          // Sink unhandled-rejection so a failed activate followed by
          // a commit retry does not surface as an uncaught error.
          activationKit.promise.catch(() => {});

          /** @type {ReturnType<typeof makePromiseKit>} */
          const localKit = activationKit;

          await null;
          try {
            // The commit handler persisted the draft before invoking
            // activate, so re-load it from disk to get the same
            // shape the cold-boot path consumes.  Stamping the
            // credentials into `process.env` here mirrors the
            // cold-boot stamping side-effect (see
            // `stampPersistedEnv` below) so pi-ai's request-time
            // `getEnvApiKey` lookups find the freshly-committed
            // credentials.
            const persisted = await loadPersistedConfig(workspaceDir);
            if (!persisted) {
              throw makeError(
                X`activate: persisted config missing after /model commit (workspace=${q(workspaceDir)})`,
              );
            }
            stampPersistedEnv(persisted);
            const modelString = `${persisted.model.provider}/${persisted.model.modelId}`;

            await activatePiAgent({ modelString, state: primordialState });

            console.log(
              `[genie:${agentName}] Transitioned to piAgent mode (model: ${modelString})`,
            );

            // After successful activation, persist the committed
            // model on `state.committed` so `/model show` and
            // `/model list` mark the active provider correctly.
            primordialState.committed = harden({
              provider: persisted.model.provider,
              modelId: persisted.model.modelId,
              credentials: harden({ ...persisted.model.credentials }),
              options: harden({ ...persisted.model.options }),
            });

            // Wire requestRestart now that we are in piAgent mode so
            // a subsequent `/model commit` from this same worker
            // (without restart) triggers the worker-exit path.
            primordialState.requestRestart = scheduleWorkerRestart;

            localKit.resolve(undefined);
          } catch (err) {
            // Roll back the persisted config so the next worker
            // restart does not attempt to load a config the
            // activation could not honour.  Roll-back failures are
            // logged but not re-thrown — the operator already saw
            // the original activation error.
            try {
              await clearPersistedConfig(workspaceDir);
              console.warn(
                `[genie:${agentName}] activation failed; rolled back persisted config: ${(err && /** @type {Error} */ (err).message) || String(err)}`,
              );
            } catch (rollbackErr) {
              console.error(
                `[genie:${agentName}] activation failed AND rollback failed: ${(rollbackErr && /** @type {Error} */ (rollbackErr).message) || String(rollbackErr)}`,
              );
            }
            localKit.reject(err);
            // Reset so a subsequent commit can retry from scratch.
            activationKit = undefined;
            throw err;
          }
          return localKit.promise;
        },
      };
      const primordialAutomaton = makePrimordialAutomaton({
        workspaceDir,
        state: primordialState,
      });
      const agentLoopP = runAgentLoop({
        agentPowers: rootPowers,
        agentName,
        workspaceDir,
        cancelledP,
        state: primordialState,
        primordialAutomaton,
        persistence,
      });
      agentLoopP.catch(err => {
        console.error(`[genie:${agentName}] Primordial loop error:`, err);
        cancel(undefined);
      });
      return;
    }

    // ── Cold-boot piAgent mode ────────────────────────────────────
    // `state.activate` is a no-op (we are already in piAgent mode);
    // `state.requestRestart` triggers a worker exit so a subsequent
    // `/model commit` can rely on daemon reincarnation to apply the
    // new config.
    /** @type {import('./src/primordial/index.js').PrimordialState} */
    const piAgentState = {
      mode: 'piAgent',
      activate: async () => {},
      requestRestart: scheduleWorkerRestart,
    };

    // Persistence hook for piAgent-mode `/model commit`: same
    // workspace-relative `<workspace>/.genie/config.json` shape as
    // primordial mode.
    const persistence = harden({
      /** @param {import('./src/primordial/index.js').ModelDraft} draft */
      saveConfig: async draft => {
        await savePersistedConfig(workspaceDir, {
          version: 1,
          model: {
            provider: draft.provider,
            modelId: draft.modelId,
            credentials: { ...(draft.credentials || {}) },
            options: { ...(draft.options || {}) },
          },
        });
      },
    });

    // Start the message loop fire-and-forget BEFORE activatePiAgent
    // populates the pack; `agentsRef` reads through `state` so the
    // dispatcher will see the agents the moment activation finishes.
    const agentLoopP = runAgentLoop({
      agentPowers: rootPowers,
      agentName,
      workspaceDir,
      cancelledP,
      state: piAgentState,
      persistence,
    });
    agentLoopP.catch(err => {
      console.error(`[genie:${agentName}] Agent loop error:`, err);
      cancel(undefined);
    });

    await activatePiAgent({
      modelString: config.model || '',
      state: piAgentState,
    });
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
   * Resolve the boot mode from the configured sources.  Precedence
   * (TODO/92 § 1c): env-var wins, then the persisted config written
   * by a prior `/model` run, then primordial as a last resort.  Kept
   * as one small switch block so the full rule is visible in a
   * single diff to audit.
   *
   * Sub-task 96 of `TODO/92_genie_primordial.md` replaced the
   * persistence stub with a real filesystem-backed loader: the
   * persisted config is `<workspaceDir>/.genie/config.json` (see
   * `src/primordial/persistence.js`).  When loaded, the config block
   * is returned verbatim so the boot path can stamp `credentials` /
   * `options` into `process.env` before constructing the agent pack.
   *
   * @returns {Promise<
   *   | { mode: 'piAgent', model: string, persisted?: import('./src/primordial/types.js').Config }
   *   | { mode: 'primordial' }
   * >}
   */
  const resolveBootMode = async () => {
    if (env.GENIE_MODEL) {
      return { mode: 'piAgent', model: env.GENIE_MODEL };
    }
    const persisted = await loadPersistedConfig(workspace);
    if (persisted) {
      const { provider, modelId } = persisted.model;
      return {
        mode: 'piAgent',
        model: `${provider}/${modelId}`,
        persisted,
      };
    }
    return { mode: 'primordial' };
  };

  /**
   * Stamp `credentials` and `options` from a persisted {@link
   * import('./src/primordial/types.js').Config} into `process.env`.
   *
   * V1 hack documented in `TODO/96_genie_model_persistence.md`:
   * pi-ai's provider modules read `process.env` *at request time*
   * (see `pi-ai/dist/env-api-keys.js:47-105`), so the env stamping
   * has to remain in place for the lifetime of the worker — there is
   * no clean credential-passing channel yet.  Tracked as a follow-up
   * under TODO/92 § 3g.
   *
   * Existing env-var values win over the persisted ones so an
   * operator overriding a credential at launch time (e.g. by
   * exporting `ANTHROPIC_API_KEY` before `bottle.sh invoke`) is not
   * silently overwritten by an older committed value.
   *
   * @param {import('./src/primordial/types.js').Config} persisted
   */
  const stampPersistedEnv = persisted => {
    /** @type {Record<string, string>} */
    const merged = {
      ...(persisted.model.options || {}),
      ...(persisted.model.credentials || {}),
    };
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value !== 'string' || value.length === 0) continue;
      // Preserve existing env values so launcher-supplied overrides win.
      if (process.env[key] !== undefined && process.env[key] !== '') continue;
      process.env[key] = value;
    }
  };

  // Kick off the root agent (fire-and-forget within the daemon worker).
  // Wrapped in an async IIFE so `resolveBootMode` (which may do disk
  // I/O in sub-task 96) can be awaited without blocking `make()`'s
  // synchronous return of the Genie exo.
  (async () => {
    const resolved = await resolveBootMode();
    if (resolved.mode === 'piAgent' && resolved.persisted) {
      // Stamp persisted credentials before `runRootAgent` reaches
      // `makeGenieAgents` so pi-ai's request-time `getEnvApiKey`
      // lookups find the operator's configured values.
      stampPersistedEnv(resolved.persisted);
    }
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
