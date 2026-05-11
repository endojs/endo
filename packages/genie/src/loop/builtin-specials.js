// @ts-check

/** @import { ChatEvent } from '../agent/index.js' */
/** @import { GenieAgents } from './agents.js' */
/** @import { HeartbeatEvent } from '../heartbeat/index.js' */
/** @import { SpecialHandler } from './specials.js' */

import harden from '@endo/harden';

import { runHeartbeat, HeartbeatStatus } from '../heartbeat/index.js';

/**
 * @template Chunk
 * @typedef {object} SpecialsIO
 * @property {(msg: string) => Chunk} info
 *   - Dim / neutral informational line (e.g. "Conversation history cleared.").
 * @property {(msg: string) => Chunk} notice
 *   - Progress notice (e.g. "Running reflection cycle...").
 * @property {(msg: string) => Chunk} warn
 *   - Non-fatal warning (e.g. "Observation is already in progress.").
 * @property {(msg: string) => Chunk} error
 *   - Error message.
 * @property {(msg: string) => Chunk} success
 *   - Success notice (e.g. "✓ Observation complete.").
 * @property {(events: AsyncIterable<ChatEvent>, options?: { label?: string }) => AsyncIterable<Chunk>} renderEvents
 *   - Render a sub-agent's `ChatEvent` stream into output chunks.
 *     `options.label` lets the caller disambiguate observer vs. reflector
 *     streams (used by dev-repl's colourised prefix).
 * @property {(label: string) => void} [muteBackground]
 *   - Temporarily suppress the background-event stream for the given label
 *     while a caller-driven command is consuming the same events.
 * @property {(label: string) => void} [unmuteBackground]
 *   - Pair of `muteBackground`; resume the background stream.
 * @property {() => void} [clearHistory]
 *   - Clear the main chat agent's session history.
 *     May trigger observation.
 * @property {() => string[]} [listToolNames]
 *   - Enumerate tool names for the `tools` handler.
 *     Defaults to `[]` when unset.
 * @property {() => Iterable<string>} [listHelpLines]
 *   - Yield one pre-formatted help line per entry for the `help` handler.
 *     The caller is responsible for ANSI formatting (via `io.info`).
 * @property {() => void} [requestExit]
 *   - Signal the outer loop that the user requested exit.
 *     No-op in the daemon deployment, where `/exit` from a user message should not terminate the guest.
 * @property {boolean} [verbose]
 *   - Pass-through option for `renderEvents`.
 */

/**
 * @template Chunk
 * @typedef {object} BuiltinSpecialsOptions
 * @property {GenieAgents} agents
 *   - The pre-wired agent pack returned by `makeGenieAgents`.
 * @property {string} workspaceDir
 *   - Workspace directory passed to `runHeartbeat`.
 * @property {SpecialsIO<Chunk>} io
 *   - Rendering / side-effect surface that adapts built-in behaviour to the
 *     host deployment.
 */

/**
 * @template T, R
 * @param {(r: R) => void} capture
 * @param {AsyncIterable<T, R>} source
 * @returns {AsyncGenerator<T>}
 */
async function* collectIt(capture, source) {
  const result = yield* source;
  capture(result);
}

/**
 * Built-in specials — the shared command set both `dev-repl.js` and
 * `main.js` mount into their respective dispatchers.
 *
 * Each deployment picks the subset it wants and merges in its own extras
 * (e.g. dev-repl's `background` toggle)
 * before handing the result to `makeSpecialsDispatcher`.
 *
 * The deployment-specific parts — ANSI colouring vs. plain text, stdout writes
 * vs. daemon-mail replies, readline-aware background muting — live behind the
 * `io` interface so the built-in handlers themselves stay rendering-agnostic.
 *
 * Dev-repl and main.js each pick the subset of handlers they want —
 * - dev-repl mounts the full set plus its own `background` toggle
 * - the daemon plugin mounts `observe` / `reflect` (heartbeat ticks remain
 *   handled outside the dispatcher because they are system-originated
 *   self-sends, not user commands).
 *
 * @template Chunk
 * @param {BuiltinSpecialsOptions<Chunk>} options
 * @returns {Record<'heartbeat'|'observe'|'reflect'|'help'|'tools'|'clear'|'exit', SpecialHandler<Chunk>>}
 */
export const makeBuiltinSpecials = ({ agents, io, workspaceDir }) => {
  const { piAgent, heartbeatAgent, observer, reflector } = agents;

  /** @type {SpecialHandler<Chunk>} */
  const heartbeat = async function* heartbeatHandler(_tail) {
    yield io.notice('Running heartbeat cycle...');
    /** @type {HeartbeatEvent|null} */
    let heartbeatEvent = null;
    try {
      yield* io.renderEvents(
        collectIt(
          he => {
            heartbeatEvent = he;
          },
          runHeartbeat({ workspaceDir, piAgent: heartbeatAgent }),
        ),
        { label: 'heartbeat' },
      );
      if (!heartbeatEvent) {
        yield io.warn('⚠ Heartbeat failed, but did not throw?');
      } else {
        // TODO why need the cast
        const { status } = /** @type {HeartbeatEvent} */ (heartbeatEvent);
        if (status !== HeartbeatStatus.Ok) {
          yield io.warn(`⚠ Heartbeat completed not OK: ${status}`);
        } else {
          yield io.success('✓ Heartbeat OK.');
        }
      }
    } catch (err) {
      yield io.error(`Heartbeat failed: ${/** @type {Error} */ (err).message}`);
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const observe = async function* observeHandler(_tail) {
    if (!observer) {
      yield io.error('Observer not available (memory tools required).');
      return;
    }
    if (observer.isRunning()) {
      yield io.warn('Observation is already in progress.');
      return;
    }
    const events = await observer.observe(piAgent);
    if (!events) {
      yield io.info('No unobserved messages to process.');
      return;
    }
    if (io.muteBackground) io.muteBackground('observer');
    yield io.notice('Running observation cycle...');
    try {
      yield* io.renderEvents(events, { label: 'observer' });
      yield io.success('✓ Observation complete.');
    } catch (err) {
      yield io.error(
        `Observation failed: ${/** @type {Error} */ (err).message}`,
      );
    } finally {
      if (io.unmuteBackground) io.unmuteBackground('observer');
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const reflect = async function* reflectHandler(_tail) {
    if (!reflector) {
      yield io.error('Reflector not available (memory tools required).');
      return;
    }
    if (reflector.isRunning()) {
      yield io.warn('Reflection is already in progress.');
      return;
    }
    // `reflect()` only returns `undefined` when `running` is true, and the
    // `isRunning` guard above already covers that case.
    const events = /** @type {AsyncIterable<ChatEvent>} */ (
      await reflector.reflect()
    );
    if (io.muteBackground) io.muteBackground('reflector');
    yield io.notice('Running reflection cycle...');
    try {
      yield* io.renderEvents(events, { label: 'reflector' });
      yield io.success('✓ Reflection cycle complete.');
    } catch (err) {
      yield io.error(
        `Reflection failed: ${/** @type {Error} */ (err).message}`,
      );
    } finally {
      if (io.unmuteBackground) io.unmuteBackground('reflector');
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const help = async function* helpHandler(_tail) {
    if (io.listHelpLines) {
      for (const line of io.listHelpLines()) {
        yield io.info(line);
      }
    } else {
      yield io.info('No help available.');
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const tools = async function* toolsHandler(_tail) {
    const names = io.listToolNames ? io.listToolNames() : [];
    if (names.length === 0) {
      yield io.info('-- No Tools --');
      return;
    }
    for (const name of names) {
      yield io.info(`  • ${name}`);
    }
  };

  /** @type {SpecialHandler<Chunk>} */
  const clear = async function* clearHandler(_tail) {
    if (!io.clearHistory) {
      yield io.warn('Clear not supported in this deployment.');
      return;
    }
    io.clearHistory();
    yield io.info('Conversation history cleared.');
  };

  /** @type {SpecialHandler<Chunk>} */
  const exit = async function* exitHandler(_tail) {
    yield io.info('Goodbye.');
    if (io.requestExit) io.requestExit();
  };

  return harden({ heartbeat, observe, reflect, help, tools, clear, exit });
};
harden(makeBuiltinSpecials);

/**
 * Short descriptions for each built-in handler, used to compose help
 * listings.
 *
 * Keyed by handler name (no prefix) so deployments mounting a subset (e.g. the
 * daemon plugin omits `clear` / `exit`) can filter down to their
 * actually-mounted commands.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BUILTIN_HELP_DESCRIPTIONS = harden({
  heartbeat: 'run a heartbeat cycle',
  observe: 'run an observation cycle',
  reflect: 'run a reflection cycle',
  help: 'show this help',
  tools: 'list available tools',
  clear: 'clear conversation history',
  exit: 'quit the REPL',
});

/**
 * Format a "Commands:" help listing for the given command prefix.
 *
 * Command names that have no entry in `BUILTIN_HELP_DESCRIPTIONS` are
 * silently skipped so deployments can list whichever subset they mount
 * without redefining the descriptions.
 *
 * Deployment-specific commands (e.g. dev-repl's `.background`) go in `extras`
 * as `[invocation, description]` pairs — the invocation is emitted
 * verbatim so callers can include the prefix and any argument grammar.
 *
 * The yielded lines are plain strings; callers wrap them with ANSI
 * styling via `io.info` if desired.
 *
 * @param {object} options
 * @param {string} options.prefix - Command prefix (e.g. `'.'` or `'/'`).
 * @param {Iterable<string>} options.commands
 *   - Names of built-in commands to include, in listing order.
 * @param {Iterable<[string, string]>} [options.extras]
 *   - Extra `[invocation, description]` pairs appended after the built-ins.
 * @returns {Iterable<string>}
 */
export const formatHelpLines = function* formatHelpLines({
  prefix,
  commands,
  extras = [],
}) {
  yield 'Commands:';

  // 26 columns preserves the pre-refactor column width.
  const NAME_WIDTH = 26;

  for (const [invocation, desc] of extras) {
    yield `  ${invocation.padEnd(NAME_WIDTH)} — ${desc}`;
  }

  for (const name of commands) {
    const desc = BUILTIN_HELP_DESCRIPTIONS[name];
    // eslint-disable-next-line no-continue
    if (!desc) continue;
    const invocation = `${prefix}${name}`;
    yield `  ${invocation.padEnd(NAME_WIDTH)} — ${desc}`;
  }
};
harden(formatHelpLines);
