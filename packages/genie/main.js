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

import { isAbsolute, join } from 'path';

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
import { makeSandboxSpawner } from './src/tools/sandbox-spawner.js';
import { initWorkspace, initWorkspaceMount } from './src/workspace/init.js';

/** @import { SandboxHandleLike } from './src/tools/sandbox-spawner.js' */
/** @import { BackendProbe, BackendSelector, SandboxFactory, SandboxHandle, MountCap, MountSpec, NetworkProfile, RootfsSpec } from '@endo/sandbox/types.js' */

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

/**
 * Slice-internal mount point for the workspace.  Mirrors the path
 * documented in `setup.js` and the genie README; agents see the
 * workspace under this fixed path inside the slice regardless of the
 * host directory it maps from.
 */
const SLICE_WORKSPACE_PATH = '/workspace';

/**
 * Allowed sandbox network profiles.  Mirrors `NetworkProfileShape` in
 * `packages/sandbox/src/interfaces.js` so the form-side check can
 * reject unknown profiles up front rather than waiting for the
 * factory's interface guard to refuse them mid-mint.
 */
const ALLOWED_NETWORK_PROFILES = harden([
  'none',
  'private',
  'host-loopback',
  'host-lan',
  'host-net',
]);

/**
 * @param {string} network
 * @returns {network is NetworkProfile}
 */
const isAllowedNetworkProfile = network =>
  ALLOWED_NETWORK_PROFILES.includes(network);

/** Default network profile for genie slices. */
const DEFAULT_NETWORK_PROFILE = 'private';

/** Default backend selector for genie slices. */
const DEFAULT_BACKEND = 'auto';

/**
 * Allowed sandbox backend selectors.  Mirrors `BackendSelectorShape`
 * in `packages/sandbox/src/interfaces.js` (`'auto' | BackendName`) so
 * the form-side check can reject typos up front rather than waiting
 * for the factory's interface guard to refuse them mid-mint.
 */
const ALLOWED_BACKENDS = harden([
  'auto',
  'bwrap',
  'podman',
  'lima',
  'containerization',
  'wsl',
]);

/**
 * @param {string} backend
 * @returns {backend is BackendSelector}
 */
const isAllowedBackend = backend => ALLOWED_BACKENDS.includes(backend);

/**
 * Allowed rootfs kind keywords that the form accepts directly (no
 * payload).  Mirrors the keyword-only arms of `RootfsSpec` in
 * `packages/sandbox/src/types.d.ts` ~line 143.  The `oci:<ref>` shape
 * carries a payload and is parsed separately by `parseRootfsValue`;
 * the `MountCap` (pet-name) shape resolves through `agentGuest`
 * inside `spawnAgent` after `parseRootfsValue` reports the
 * `'pet-name'` marker (see `TODO/52_genie_rootfs_mount_cap.md`).
 */
export const ALLOWED_ROOTFS_KINDS = harden(['host-bind', 'minimal']);

/** Default rootfs kind for genie slices. */
const DEFAULT_ROOTFS_KIND = 'host-bind';

/**
 * @param {string} kind
 * @returns {kind is 'host-bind' | 'minimal'}
 */
export const isAllowedRootfsKind = kind => ALLOWED_ROOTFS_KINDS.includes(kind);
harden(isAllowedRootfsKind);

/**
 * @typedef {(
 *   | { kind: 'host-bind' }
 *   | { kind: 'minimal' }
 *   | { kind: 'oci', ref: string }
 *   | { kind: 'pet-name', petName: string }
 * )} ParsedRootfsValue
 *
 * The synchronous form-side parse result.  The first three arms map
 * directly onto `RootfsSpec` keyword shapes; the `'pet-name'` arm is
 * a placeholder marker that `spawnAgent` resolves against
 * `agentGuest`'s namespace and validates against `MountInterface`
 * before passing the looked-up cap into `E(sandboxFactory).make(...)`
 * as the `RootfsSpec` `MountCap` arm.
 */

/**
 * Parse a `rootfs` form value into a {@link ParsedRootfsValue}.
 *
 * Accepts:
 *   - `'host-bind'` -> `{ kind: 'host-bind' }`
 *   - `'minimal'`   -> `{ kind: 'minimal' }`
 *   - `'oci:<ref>'` -> `{ kind: 'oci', ref }` (with `ref` non-empty).
 *   - any other non-empty string -> `{ kind: 'pet-name', petName }`,
 *     a placeholder marker that `spawnAgent` resolves through
 *     `E(agentGuest).lookup(petName)` and validates against
 *     `MountInterface` (see `TODO/52_genie_rootfs_mount_cap.md`).
 *
 * Throws a structured error naming the agent for non-string inputs,
 * the empty string, and an `'oci:'` prefix with no reference.  The
 * helper itself stays synchronous; the pet-name -> Mount-cap
 * resolution is the caller's responsibility because it requires an
 * eventual send into the agent guest's namespace.
 *
 * @param {string} value
 * @param {object} options
 * @param {string} options.agentName
 * @returns {ParsedRootfsValue}
 */
export const parseRootfsValue = (value, { agentName }) => {
  if (typeof value !== 'string') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs value must be a string; got ${q(typeof value)}`,
    );
  }
  if (value === '') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs value is empty; expected one of ${q(ALLOWED_ROOTFS_KINDS.join(', '))}, ${q('oci:<ref>')}, or a pet name introduced into the agent guest's namespace`,
    );
  }
  if (value === 'host-bind') {
    return harden({ kind: 'host-bind' });
  }
  if (value === 'minimal') {
    return harden({ kind: 'minimal' });
  }
  if (value.startsWith('oci:')) {
    const ref = value.slice('oci:'.length);
    if (ref === '') {
      throw makeError(
        X`agent ${q(agentName)}: rootfs ${q(value)} is missing the OCI image reference; expected ${q('oci:<ref>')} (e.g. ${q('oci:docker.io/library/alpine:3.19')})`,
      );
    }
    return harden({ kind: 'oci', ref });
  }
  // Fall through to the pet-name branch.  The form has no legacy
  // host-path arm for `rootfs` (unlike `workspace`), so anything that
  // isn't a recognised keyword or `oci:<ref>` is treated as a pet
  // name pointing at a Mount cap already introduced into the agent
  // guest's namespace.  `spawnAgent` resolves and validates the cap;
  // a typo surfaces there as a structured error rather than throwing
  // here — mirroring the workspace pet-name branch's discipline.
  return harden({ kind: 'pet-name', petName: value });
};
harden(parseRootfsValue);

/**
 * Cross-validate a {@link ParsedRootfsValue} against the resolved
 * backend selector.  The bwrap driver rejects `oci:` rootfs
 * internally with a structured error (see
 * `packages/sandbox/src/drivers/bwrap.js` ~lines 318-326 and
 * 544-552); front-running that check here surfaces a friendlier
 * message that names the agent and points at the fix before we ever
 * reach `E(sandboxFactory).make(...)`.
 *
 * The keyword shapes (`host-bind`, `minimal`) and the `'pet-name'`
 * marker are compatible with both `bwrap` and `podman` and pass
 * through unchanged; only `oci` + `bwrap` is rejected.
 *
 * @param {ParsedRootfsValue} rootfs
 * @param {string} backend
 * @param {object} options
 * @param {string} options.agentName
 */
export const assertRootfsBackendCompatible = (
  rootfs,
  backend,
  { agentName },
) => {
  if (rootfs.kind === 'oci' && backend === 'bwrap') {
    throw makeError(
      X`agent ${q(agentName)}: rootfs ${q(`oci:${rootfs.ref}`)} is incompatible with ${q('backend: bwrap')}; set ${q('backend')} to ${q('podman')} or pick a non-oci rootfs`,
    );
  }
};
harden(assertRootfsBackendCompatible);

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
   * `workspaceDir` still points at the host filesystem path because the
   * `memory` group and the FTS5 search backend rely on Node-specific
   * APIs (atomic writes, SQLite) that have no Mount equivalent.  When
   * `workspaceMount` is supplied, the `files` group routes its reads
   * and writes through the Mount cap surface instead of holding ambient
   * host fs authority — see `buildGenieTools` for the seam.  When a
   * `spawner` is supplied (the slice-backed adapter from
   * `./src/tools/sandbox-spawner.js`), the `bash` / `exec` / `git`
   * tools route through the slice instead and see the workspace at the
   * slice-internal mount path (`SLICE_WORKSPACE_PATH`).
   *
   * The slice's bind-mount lands on the same bytes the daemon-side
   * tools see, so the host-path / Mount-cap / slice views all stay in
   * lockstep regardless of which routing the file tools use.
   *
   * @param {string} workspaceDir - Root directory for file tools
   * @param {import('./src/tools/spawner.js').Spawner} [spawner] -
   *   Optional command-spawn engine.  When omitted, command tools fall
   *   through to the host spawner baked into `command.js`.
   * @param {MountCap} [workspaceMount] - Optional Endo Mount capability
   *   rooted at `workspaceDir`.  When supplied, the `files` tool group
   *   routes its reads and writes through the Mount surface
   *   (`makeMountVFS`) instead of `makeNodeVFS`.
   */
  const buildTools = (workspaceDir, spawner, workspaceMount) => {
    const searchBackend = makeFTS5Backend({ dbDir: workspaceDir });
    const mountVFSCap =
      /** @type {import('./src/tools/vfs-mount.js').MountVFSCap | undefined} */ (
        workspaceMount
      );
    return buildGenieTools({
      workspaceDir,
      include: PLUGIN_DEFAULT_INCLUDE,
      searchBackend,
      ...(spawner ? { spawner } : {}),
      ...(mountVFSCap ? { workspaceMount: mountVFSCap } : {}),
    });
  };

  /**
   * @typedef {object} AgentConfig
   * @property {string} model
   * @property {string} workspace
   * @property {string} name
   * @property {string} [agentDirectory]
   * @property {string} [heartbeatPeriod]
   * @property {string} [heartbeatTimeout]
   * @property {string} [observerModel] - Model string for the observer
   *   agent.  Defaults to the main chat model.  A fast,
   *   non-reasoning model is recommended.
   * @property {string} [reflectorModel] - Model string for the reflector
   *   agent.  Defaults to the main chat model.  A reasoning-capable
   *   model is recommended.
   * @property {string} [backend] - Sandbox backend selector.  One of
   *   `'auto' | 'bwrap' | 'podman' | 'lima' | 'containerization' |
   *   'wsl'`.  Defaults to `'auto'` which picks the first available
   *   driver reported by `listBackends()`.  Only consulted when the
   *   genie guest was introduced to a `sandbox-factory` cap.
   * @property {string} [network] - Sandbox network profile.  One of
   *   `'none' | 'private' | 'host-loopback' | 'host-lan' | 'host-net'`.
   *   Defaults to `'private'` so the slice gets a loopback-only network
   *   namespace.  Only consulted when minting a slice.
   * @property {string} [rootfs] - Sandbox rootfs selector.  Either one
   *   of the keyword shapes (`'host-bind' | 'minimal'`), the
   *   payload-carrying `'oci:<ref>'` shape (e.g.
   *   `'oci:docker.io/library/alpine:3.19'`), or a pet name already
   *   introduced into the agent guest's namespace that resolves to a
   *   Mount cap rooted at a userland tree.  Defaults to `'host-bind'`.
   *   Only consulted when minting a slice.  The `'oci:<ref>'` shape
   *   is incompatible with `backend: 'bwrap'` and the form-side check
   *   rejects that combination up front; the Mount-cap (pet-name)
   *   shape is compatible with both `bwrap` and `podman` (see
   *   `TODO/52_genie_rootfs_mount_cap.md`).
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
   * When `capabilities.sandboxFactory` is provided, the agent mints a
   * confined sandbox slice via
   * `E(sandboxFactory).make({...})` and routes the `bash` / `exec` /
   * `git` tools through it via the slice-backed spawner from
   * `./src/tools/sandbox-spawner.js`.  Slice teardown is wired to the
   * agent's `cancelledP` so the bwrap subprocess and scratch upper
   * layer are reclaimed promptly even before the GC sweep.
   *
   * If `sandboxFactory` is supplied but the slice cannot be minted
   * (no available backend, factory throws, or the workspace mount cap
   * is missing), `spawnAgent` refuses to start the agent rather than
   * silently falling back to direct host spawning — the operator
   * should see slice failures explicitly (PLAN § "Security boundary
   * clarity").
   *
   * @param {FarRef<EndoHost>} hostAgent - The host agent reference
   * @param {string} agentName - Pet name for the new agent guest
   * @param {AgentConfig} config - Agent configuration
   * @param {EndoGuest} [parentPowers] - Optional parent guest powers for scoped child tracking
   * @param {object} [capabilities] - Caller-resolved capabilities
   * @param {MountCap} [capabilities.defaultWorkspaceMount] - Mount cap for `process.cwd()` injected by setup.js legacy path
   * @param {SandboxFactory} [capabilities.sandboxFactory] - Sandbox factory; when present, slice minting is mandatory
   */
  const spawnAgent = async (
    hostAgent,
    agentName,
    config,
    parentPowers,
    capabilities = {},
  ) => {
    const { defaultWorkspaceMount, sandboxFactory } = capabilities;

    await Promise.resolve();

    const profileName = `profile-for-${agentName}`;

    // Build introducedNames: only grant capabilities the child needs.
    // Mirrors `setup.js`'s mapping so child agents see the same names
    // (`workspace`, `sandboxes`) regardless of whether they were
    // spawned by `setup-genie` directly or forked from a parent agent.
    /** @type {Record<string, string>} */
    const introducedNames = {};
    if (await E(hostAgent).has('workspace-mount')) {
      introducedNames['workspace-mount'] = 'workspace';
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
      agentGuest = await E(hostAgent).provideGuest(agentName, {
        agentName: profileName,
        introducedNames: harden(introducedNames),
      });
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

    // The form's `workspace` value may be either:
    //   • an absolute host path (legacy) — `spawnAgent` mints a fresh
    //     per-agent Mount via `E(hostAgent).provideMount(...)`, or
    //   • a pet name already introduced into the agent's namespace
    //     (e.g. `workspace`, the cap setup.js minted as
    //     `workspace-mount`) — `spawnAgent` reuses that cap rather
    //     than re-minting, collapsing the two-mount-per-agent
    //     footprint to a single daemon-minted Mount that all agents
    //     share.
    //
    // When omitted, the parent's `defaultWorkspaceMount` (looked up
    // before form submission) carries through and `workspaceDir`
    // falls back to `process.cwd()` for the daemon-side fs / memory
    // tools — matching the pre-rollout behaviour.
    /** @type {MountCap | undefined} */
    let workspaceMount = defaultWorkspaceMount;
    /** @type {string} */
    let workspaceDir;
    if (config.workspace) {
      if (isAbsolute(config.workspace)) {
        // Legacy host-path: mint a per-agent mount on the way in.
        const workspacePetName = `${config.name}-workspace`;
        workspaceMount = /** @type {MountCap} */ (
          await E(hostAgent).provideMount(config.workspace, workspacePetName)
        );
        workspaceDir = config.workspace;
      } else {
        // Pet name already introduced into the agent's namespace.
        // Validate the Mount surface up front so a typo surfaces as
        // a structured error rather than a duck-typing failure deep
        // inside `initWorkspace` or the slice-mint call.
        const cap = await E(agentGuest).lookup(config.workspace);
        /** @type {string[]} */
        const methods = /** @type {string[]} */ (
          // eslint-disable-next-line no-underscore-dangle
          await E(cap).__getMethodNames__()
        );
        const required = [
          'readText',
          'writeText',
          'makeDirectory',
          'has',
          'list',
        ];
        const missing = required.filter(m => !methods.includes(m));
        if (missing.length > 0) {
          throw makeError(
            X`agent ${q(agentName)}: workspace pet name ${q(config.workspace)} does not refer to a Mount cap (missing methods: ${q(missing.join(', '))}; available: ${q(methods.join(', '))})`,
          );
        }
        workspaceMount = /** @type {MountCap} */ (cap);
        // Bridge back to a host path for the daemon-side `memory` /
        // FTS5 tools (atomic writes + SQLite have no Mount equivalent).
        // The `files` tool group rides the Mount cap directly via
        // `makeMountVFS` (TODO/25); `initWorkspace` rides the Mount cap
        // via `initWorkspaceMount` (TODO/23).  The host path here is
        // only the storage root for the side-channel pieces.
        workspaceDir = /** @type {string} */ (
          await E(hostAgent).provideHostPath(workspaceMount)
        );
      }
    } else {
      workspaceDir = process.cwd();
    }

    // Seed the workspace from the shipped template on first spawn.
    // Existing files are never overwritten.  This runs **before** the
    // slice is minted; the slice exposes the seed files via the
    // `Mount`, so no slice-internal `cp` is required.
    //
    // When a `workspaceMount` cap is available, drive the seed copy
    // through `E(mount).writeText` so the daemon-side confinement and
    // the slice's bind-mount see the seed bytes through the same cap
    // surface (TODO/23 lift).  Otherwise — only on the legacy
    // `process.cwd()` no-mount path — fall back to the host-path
    // signature `dev-repl.js` also uses.
    const didInit = workspaceMount
      ? await initWorkspaceMount(workspaceMount)
      : await initWorkspace(workspaceDir);
    if (didInit) {
      console.log(
        `[genie:${agentName}] Workspace initialised from template: ${workspaceDir}${workspaceMount ? ' (via Mount cap)' : ''}`,
      );
    }

    // Cancellation kit — resolving `cancel` signals all sub-systems
    // (agent loop, heartbeat, slice teardown) to tear down.
    const { promise: cancelledP, resolve: cancel } = makePromiseKit();

    // ── Form-side validation of slice knobs ────────────────────────
    // Reject typos up front (the factory's `M.interface()` would also
    // refuse them, but the form-side check produces a friendlier
    // message that names the agent).
    const network = config.network || DEFAULT_NETWORK_PROFILE;
    if (!isAllowedNetworkProfile(network)) {
      throw makeError(
        X`agent ${q(agentName)}: unknown network profile ${q(network)}; expected one of ${q(ALLOWED_NETWORK_PROFILES.join(', '))}`,
      );
    }
    const backend = config.backend || DEFAULT_BACKEND;
    if (!isAllowedBackend(backend)) {
      throw makeError(
        X`agent ${q(agentName)}: unknown sandbox backend ${q(backend)}; expected one of ${q(ALLOWED_BACKENDS.join(', '))}`,
      );
    }

    // Parse the `rootfs` form value into a `ParsedRootfsValue`.  The
    // keyword-only subset (`host-bind`, `minimal`, `oci:<ref>`) is
    // resolved synchronously; the pet-name marker is resolved
    // immediately below via `E(agentGuest).lookup(...)` and validated
    // against `MountInterface` (see `TODO/52_genie_rootfs_mount_cap.md`).
    const parsedRootfs = parseRootfsValue(
      config.rootfs ?? DEFAULT_ROOTFS_KIND,
      { agentName },
    );

    // Cross-validate rootfs against the resolved backend before we
    // ever reach `E(sandboxFactory).make(...)`.  The check inspects
    // the parsed marker so the bwrap-rejects-oci rule fires *before*
    // we resolve the pet-name shape (a Mount cap is compatible with
    // both backends, so the pet-name branch passes through unchanged).
    assertRootfsBackendCompatible(parsedRootfs, backend, { agentName });

    // Resolve the pet-name marker into a Mount cap, mirroring the
    // workspace pet-name branch ~lines 1222-1255.  The other shapes
    // pass through unchanged as `RootfsSpec` keyword arms.
    /** @type {RootfsSpec} */
    let rootfs;
    if (parsedRootfs.kind === 'pet-name') {
      const cap = await E(agentGuest).lookup(parsedRootfs.petName);
      /** @type {string[]} */
      const methods = /** @type {string[]} */ (
        // eslint-disable-next-line no-underscore-dangle
        await E(cap).__getMethodNames__()
      );
      const required = [
        'readText',
        'writeText',
        'makeDirectory',
        'has',
        'list',
      ];
      const missing = required.filter(m => !methods.includes(m));
      if (missing.length > 0) {
        throw makeError(
          X`agent ${q(agentName)}: rootfs pet name ${q(parsedRootfs.petName)} does not refer to a Mount cap (missing methods: ${q(missing.join(', '))}; available: ${q(methods.join(', '))})`,
        );
      }
      rootfs = /** @type {MountCap} */ (cap);
    } else {
      rootfs = parsedRootfs;
    }

    /** @type {MountSpec[]} */
    const mounts = [
      {
        cap: workspaceMount,
        innerPath: SLICE_WORKSPACE_PATH,
        mode: 'rw',
      },
    ];

    /** @type {Record<string, string>} */
    const env = {};

    // ── Mint a sandbox slice when the factory was introduced ──────
    // PLAN § "Security boundary clarity": when `setup-genie` minted a
    // `sandbox-factory`, an agent that fails to obtain a slice must
    // error out — not fall back to direct spawning.  This preserves
    // the "explicit confinement, no implicit relaxation" rule.
    /** @type {SandboxHandle | undefined} */
    let slice;

    let resolvedBackend = backend;

    if (sandboxFactory !== undefined) {
      if (workspaceMount === undefined) {
        throw makeError(
          X`agent ${q(agentName)}: sandbox-factory configured but no workspace Mount cap available; expected setup.js to mint workspace-mount (see ${q('GENIE_WORKSPACE')}).`,
        );
      }

      // Probe before minting so the operator sees the underlying
      // failure ("bwrap not on PATH", "kernel lacks user namespaces")
      // rather than a generic make() error.
      /** @type {BackendProbe[]} */
      const probes = await E(sandboxFactory).listBackends();
      const available = probes.filter(p => p.available);
      if (available.length === 0) {
        const reasonReport = probes
          .map(p => `${p.name}: ${p.reason || 'unavailable'}`)
          .join('; ');
        throw makeError(
          X`agent ${q(agentName)}: no sandbox backends available; refusing to start (operator must install a backend such as bubblewrap): ${q(reasonReport)}`,
        );
      }
      if (backend !== 'auto') {
        const probe = probes.find(p => p.name === backend);
        if (probe === undefined || !probe.available) {
          const reason =
            probe?.reason || `driver ${backend} not registered with factory`;
          throw makeError(
            X`agent ${q(agentName)}: sandbox backend ${q(backend)} unavailable; refusing to start: ${q(reason)}`,
          );
        }
      } else {
        resolvedBackend = available[0].name;
      }

      try {
        slice = await E(sandboxFactory).make(
          harden({
            rootfs,
            mounts,
            network,
            env,
            cwd: SLICE_WORKSPACE_PATH,
            backend,
          }),
        );
      } catch (err) {
        const message = /** @type {Error} */ (err).message || String(err);
        throw makeError(
          X`agent ${q(agentName)}: failed to mint sandbox slice (backend=${q(backend)}, network=${q(network)}): ${q(message)}`,
        );
      }

      // Tear down the slice promptly on cancellation so the bwrap
      // subprocess and scratch upper layer get reclaimed before the
      // GC sweep.  Closure capture pins the handle for the agent's
      // lifetime; explicit dispose() shortens the recovery window
      // when the agent exits cleanly.
      cancelledP.then(() => {
        if (slice)
          E(slice)
            .dispose()
            .catch(err => {
              const message = /** @type {Error} */ (err).message || String(err);
              console.warn(
                `[genie:${agentName}] slice dispose error: ${message}`,
              );
            });
      });

      console.log(
        `[genie:${agentName}] Sandbox slice minted (backend: ${resolvedBackend}, network: ${network}, mount: ${SLICE_WORKSPACE_PATH} <- ${workspaceDir}).`,
      );
    }

    // Build the slice-backed spawner only when a slice was minted;
    // otherwise the command tools fall through to the host spawner
    // baked into `command.js` (the legacy direct-spawn path).
    //
    // `workspaceDir` for the daemon-side `memory` / FTS5 tools stays
    // the host path so atomic writes and the SQLite index keep working.
    // The `files` tool group switches to the Mount cap surface (see
    // `buildTools` below).  The slice's `cwd: '/workspace'` is what
    // `bash`/`exec`/`git` see; the workspace mount lands on the same
    // bytes the daemon-side tools see, so all three views stay in
    // lockstep.
    // `SandboxHandle` is a `FarRef`, so `makeSandboxSpawner` consumes
    // it directly: every method is reached via `E(handle).foo()` inside
    // the adapter, which transparently unwraps the FarRef.  The cast
    // narrows the FarRef brand to the structural `SandboxHandleLike`
    // the spawner declares — see the JSDoc on `SandboxHandleLike` for
    // why a real `FarRef<SandboxHandle>` satisfies that shape.
    const spawner = slice
      ? makeSandboxSpawner({
          handle: /** @type {SandboxHandleLike} */ (slice),
        })
      : undefined;

    // The `files` tool group rides the Mount cap when one is available
    // (see `buildGenieTools` in `src/tools/registry.js`), routing reads
    // and writes through `makeMountVFS` instead of `makeNodeVFS`.  The
    // `memory` group and FTS5 backend continue to use the host path
    // because they rely on Node-specific APIs (atomic writes, SQLite)
    // that have no Mount equivalent — the slice's bind-mount lands on
    // the same bytes either way, so the views still stay in lockstep.
    const genieTools = buildTools(workspaceDir, spawner, workspaceMount);

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

    // Announce readiness from the agent's own identity.  Include
    // backend / network so operators can grep for which slice mode
    // is in effect (or "(host)" when no slice was minted because
    // setup-genie did not introduce a sandbox-factory).
    const heartbeatInfo =
      heartbeatPeriodMs > 0 ? `, heartbeat: ${heartbeatPeriodMs / 1000}s` : '';
    // Render the rootfs kind in the slice info so operators can grep
    // the daemon log for which rootfs mode is in effect.  The OCI
    // and pet-name shapes both carry a payload (the image ref / pet
    // name) that is worth logging alongside the kind for debugging.
    // Read off `parsedRootfs` rather than the resolved `rootfs` —
    // after the pet-name branch resolves, `rootfs` is a Mount cap
    // with no `kind` property to discriminate on.
    let rootfsLabel;
    if (parsedRootfs.kind === 'oci') {
      rootfsLabel = `oci:${parsedRootfs.ref}`;
    } else if (parsedRootfs.kind === 'pet-name') {
      rootfsLabel = `pet-name:${parsedRootfs.petName}`;
    } else {
      rootfsLabel = parsedRootfs.kind;
    }
    const sliceInfo = slice
      ? `, backend: ${resolvedBackend}, network: ${network}, rootfs: ${rootfsLabel}`
      : `, backend: (host), network: (host), rootfs: (host)`;
    const innerWorkspace = slice ? SLICE_WORKSPACE_PATH : workspaceDir;
    const readyMess = `agent ready (model: ${config.model}, workspace: ${innerWorkspace}${sliceInfo}${heartbeatInfo})`;
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

    // Resolve the default workspace mount and sandbox factory.
    //
    // Both are optional during the rollout of TODO/40_genie_sandbox.md: the
    // legacy "workspace = host cwd, no slice" code path is still exercised by
    // deployments that did not set `GENIE_WORKSPACE` and have not yet adopted
    // the sandbox plugin.
    //
    // When either cap is missing we leave the corresponding variable as
    // `undefined` and the slice-minting branch in `spawnAgent` falls through
    // to the legacy direct-spawn path.
    //
    // When `sandboxFactory` is present `spawnAgent` will *require* a workspace
    // mount and refuse to start without one — the security boundary is binary.
    /** @type {MountCap | undefined} */
    let defaultWorkspaceMount;
    try {
      defaultWorkspaceMount = /** @type {MountCap} */ (
        await E(powers).lookup('workspace')
      );
    } catch (err) {
      const message = /** @type {Error} */ (err).message || String(err);
      console.warn(
        `[genie] No 'workspace' cap (${message}); falling back to direct host-cwd workspace.`,
      );
    }
    /** @type {SandboxFactory | undefined} */
    let sandboxFactory;
    try {
      sandboxFactory = /** @type {SandboxFactory} */ (
        await E(powers).lookup('sandboxes')
      );
    } catch (err) {
      const message = /** @type {Error} */ (err).message || String(err);
      console.warn(
        `[genie] No 'sandboxes' cap (${message}); falling back to direct host spawn.`,
      );
    }

    // Send the configuration form to HOST.
    await E(powers).form(
      '@host',
      'Configure Genie agent',
      harden([
        {
          name: 'name',
          label: 'Agent name',
          default: 'main-genie',
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
          label:
            'Workspace: absolute host path (legacy, mints per-agent Mount) or pet name of an already-introduced Mount cap (e.g. "workspace")',
          example: '/home/user/project   |   workspace',
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
        {
          name: 'backend',
          label:
            'Sandbox backend (auto | bwrap | podman | lima | containerization | wsl)',
          default: DEFAULT_BACKEND,
        },
        {
          name: 'network',
          label:
            'Sandbox network profile (none | private | host-loopback | host-lan | host-net)',
          default: DEFAULT_NETWORK_PROFILE,
        },
        {
          name: 'rootfs',
          label:
            'Sandbox rootfs (host-bind | minimal | oci:<ref> | <pet-name>); oci:<ref> requires backend: podman (the bwrap driver rejects it).  A pet name resolves to a Mount cap previously introduced into the agent guest (e.g. via `endo make-mount /path rootfs-mount`).',
          default: DEFAULT_ROOTFS_KIND,
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
        // Thread the resolved workspace / sandbox-factory caps so
        // spawnAgent can mint a confined slice when both are
        // available (the slice is daemon-only in v1; the dev-repl
        // path keeps using the host spawner).
        await spawnAgent(hostAgent, agentName, config, undefined, {
          defaultWorkspaceMount,
          sandboxFactory,
        });

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
