// @ts-check

/**
 * Reflector Module
 *
 * Consolidates observations into long-term knowledge.  Runs as a
 * background PiAgent instance with a broader tool set than the
 * observer (memoryGet + memorySet + memorySearch).
 *
 * Two trigger conditions:
 * 1. **Daily heartbeat** — scheduled via a `reflect` task in
 *    `HEARTBEAT.md`.
 * 2. **Size threshold** — fires when `observations.md` exceeds
 *    ~40 000 tokens.
 *
 * The reflector reads `observations.md` and `reflections.md`,
 * merges related observations, prunes stale 🟢 entries older than
 * 7 days, promotes durable facts to `reflections.md`, and
 * regenerates `profile.md` when identity-level facts change.
 *
 * ## Event subscribers
 *
 * Callers can register handlers via `subscribe(handler)`
 * to receive every `ChatEvent` emitted by the sub-agent —
 * regardless of whether the cycle was caller-driven (`reflect()`)
 * or automatic (`run()` / `checkAndRun()` / heartbeat).
 *
 * Handler errors are caught and logged;
 * a throwing subscriber cannot stall the stream or affect other subscribers.
 */

import harden from '@endo/harden';

/** @import { Tool } from '../tools/common.js' */
/** @import { SearchBackend } from '../tools/memory.js' */
/** @import { ChatEvent } from '../agent/index.js' */

import { makePiAgent, runAgentRound } from '../agent/index.js';
import { makeToolGate } from '../agent/tool-gate.js';
import { estimateTokens } from '../utils/tokens.js';

/**
 * Default token threshold for observations.md that triggers
 * reflection.
 */
const DEFAULT_REFLECTION_THRESHOLD = 40_000;
harden(DEFAULT_REFLECTION_THRESHOLD);

const OBSERVATION_PATH = 'memory/observations.md';
const REFLECTION_PATH = 'memory/reflections.md';
const PROFILE_PATH = 'memory/profile.md';

/**
 * System prompt for the reflector PiAgent.
 *
 * Instructs the agent to consolidate observations, prune stale
 * entries, promote durable facts, and update the user profile.
 */
const REFLECTOR_SYSTEM_PROMPT = `You are a knowledge consolidation agent.
Your job is to read observations and reflections, then produce a
tighter, more durable knowledge base.

## Process

1. Use memoryGet to read ${OBSERVATION_PATH}.
2. Use memoryGet to read ${REFLECTION_PATH} (may not exist yet).
3. Use memoryGet to read ${PROFILE_PATH} (may not exist yet).
4. Analyse all observations:
   a. Identify clusters of related observations and merge them into
      single, consolidated statements.
   b. Remove 🟢 (informational) entries whose date header is older
      than 7 days from today.
   c. Remove observations that are now redundant because they have
      been promoted to reflections.
5. Promote durable, repeatedly-observed facts to reflections.md.
   A fact is "durable" when it appears across multiple days or has
   🔴/🟡 priority.
6. Scan for entity names mentioned 3 or more times across
   observations and reflections.  List them in a
   \`## Entity candidates\` section at the bottom of reflections.md
   (Phase 2 PARA bridge — stub only).
7. If any identity-level facts changed (user name, role, key
   project goals, long-standing preferences), regenerate
   profile.md from the current reflections.
8. Write updated files:
   - Use memorySet to write the pruned ${OBSERVATION_PATH}.
   - Use memorySet to write the updated ${REFLECTION_PATH}.
   - If profile changed, use memorySet to write ${PROFILE_PATH}.

## Reflections format

\`\`\`markdown
## Long-term Facts

- <fact promoted from observations>
- <fact promoted from observations>

## Preferences

- <user preference or workflow habit>

## Entity candidates

- <entity name> (N mentions)
\`\`\`

## Profile format

\`\`\`markdown
# User Profile

- **Name:** <if known>
- **Role:** <if known>
- **Key projects:** <comma-separated>
- **Preferences:** <brief summary>
\`\`\`

## Rules

- Aim for 5–40× compression of the observation corpus.
- Never discard 🔴 entries unless they are explicitly superseded.
- Preserve dates on observations that survive pruning.
- Do not invent information — only consolidate what is observed.
- When in doubt, keep the observation rather than discard it.
`;
harden(REFLECTOR_SYSTEM_PROMPT);

/**
 * @param {number} attempt
 * @param {Iterable<[string, string]>} pending
 */
function* buildReflectPrompt(attempt, pending) {
  if (attempt === 1) {
    // TODO maybe subsume Process parts from system
    yield 'Run a full reflection cycle: read observations and reflections, ';
    yield 'consolidate, prune stale entries, promote durable facts, and ';
    yield 'update the profile if identity-level facts changed.';
  } else {
    yield 'Try again, you forgot to actually:';
    for (const [toolName, instruct] of pending) {
      yield `- use the ${toolName} tool with ${instruct}`;
    }
  }
}
harden(buildReflectPrompt);

/**
 * Estimate the token count of a memory file's content.
 *
 * @param {Tool} memoryGet - The memoryGet tool instance.
 * @param {string} path - Memory-relative path to the file.
 * @returns {Promise<number>} Estimated token count (0 if file
 *   does not exist).
 */
const estimateFileTokens = async (memoryGet, path) => {
  await Promise.resolve();
  try {
    const result = await memoryGet.execute({ path });
    if (result && result.success && typeof result.content === 'string') {
      return estimateTokens(result.content);
    }
  } catch (_err) {
    // File may not exist yet — that is fine.
  }
  return 0;
};

/**
 * @typedef {object} ReflectorOptions
 * @property {string} [model] - Model string for the reflector
 *   agent.  Defaults to the main chat model.  A reasoning model
 *   is recommended.
 * @property {number} [reflectionThreshold] - Token count threshold
 *   for observations.md that triggers reflection.  Default 40 000.
 * @property {Tool} memoryGet - The memoryGet tool instance.
 * @property {Tool} memorySet - The memorySet tool instance.
 * @property {Tool} memorySearch - The memorySearch tool instance.
 * @property {SearchBackend} [searchBackend] - Search backend for
 *   post-reflection sync.
 * @property {string} workspaceDir - Workspace directory path.
 * @property {(opts: any) => Promise<any>} [makeAgent] - Optional
 *   PiAgent factory.  Defaults to `makePiAgent`.  Exposed so tests
 *   can inject a stub without standing up a live LLM.
 * @property {(agent: any, prompt: string) => AsyncIterable<ChatEvent>} [runAgent]
 *   - Optional per-round event runner.  Defaults to `runAgentRound`.
 *   Exposed so tests can inject a stub event stream without a live
 *   LLM.
 * @property {(...args: any[]) => void} [logError] - Optional structured
 *   error logger.  Defaults to `console.error`.  Exposed so tests can
 *   capture reflection-failure and subscriber-isolation log lines
 *   without trying to reassign the (frozen-under-SES) global console.
 */

/**
 * @typedef {object} Reflector
 * @property {() => Promise<void>} run - Run a reflection cycle
 *   unconditionally (e.g. from heartbeat).  Drains the event stream
 *   silently; errors are logged and swallowed.
 * @property {() => Promise<boolean>} checkAndRun - Check whether
 *   observations.md exceeds the token threshold and run reflection
 *   if so.  Returns true if reflection was triggered.
 * @property {() => Promise<AsyncIterable<ChatEvent> | undefined>} reflect
 *   - Begin a reflection cycle and return an async iterable of the
 *   sub-agent's ChatEvents.  Returns `undefined` if a reflection is
 *   already running.  Callers must drain the returned iterable to
 *   completion; aborting early still clears the `running` flag.
 * @property {() => Promise<void>} stop - Stop the reflector and
 *   wait for any in-flight reflection to complete.
 * @property {() => boolean} isRunning - Whether a reflection cycle
 *   is currently in progress.
 * @property {(handler: (event: ChatEvent) => void) => () => void} subscribe
 *   - Register a handler that receives every ChatEvent emitted by the
 *   sub-agent regardless of whether the cycle was caller-driven
 *   (`reflect()`) or automatic (`run()` / `checkAndRun()` /
 *   heartbeat).  Returns an idempotent unsubscribe function.  Handler
 *   errors are caught and logged; a throwing handler cannot stall the
 *   sub-agent stream or affect other subscribers.
 */

/**
 * Create a reflector that consolidates observations into long-term
 * knowledge.
 *
 * @param {ReflectorOptions} options
 * @returns {Reflector}
 */
const makeReflector = options => {
  const {
    model,
    reflectionThreshold = DEFAULT_REFLECTION_THRESHOLD,
    memoryGet,
    memorySet,
    memorySearch,
    searchBackend,
    workspaceDir,
    makeAgent = makePiAgent,
    runAgent = runAgentRound,
    logError = (...args) => console.error(...args),
  } = options;

  /** Whether a reflection cycle is currently running. */
  let running = false;

  /** Promise for the current in-flight reflection. */
  /** @type {Promise<void> | null} */
  let inflight = null;

  /** @type {Set<(event: ChatEvent) => void>} */
  const subscribers = new Set();

  /** @param {ChatEvent} event */
  const publish = event => {
    for (const handler of subscribers) {
      try {
        handler(event);
      } catch (err) {
        logError('[reflector] subscriber failed:', err);
      }
    }
  };

  /** @param {(event: ChatEvent) => void} handler */
  const subscribe = handler => {
    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  };

  /**
   * Build the tool-list and exec-tool functions expected by
   * `makePiAgent`.
   */
  const toolMap = harden({
    memoryGet,
    memorySet,
    memorySearch,
  });

  const listTools = () => [
    { name: 'memoryGet', summary: memoryGet.help() },
    { name: 'memorySet', summary: memorySet.help() },
    { name: 'memorySearch', summary: memorySearch.help() },
  ];

  /**
   * @param {string} name
   * @param {any} args
   */
  const execTool = async (name, args) => {
    const tool = toolMap[name];
    if (!tool) {
      throw new Error(`Reflector: unknown tool ${name}`);
    }
    return tool.execute(args);
  };

  /**
   * Run a single reflection cycle, yielding the sub-agent's
   * ChatEvents as they arrive.
   *
   * Post-run cleanup (`searchBackend.sync`) happens in the `finally`
   * block so it fires whether the caller fully drains the iterable or
   * aborts early.
   *
   * @param {any} reflectorAgent - A ready-to-use PiAgent instance.
   * @returns {AsyncIterable<ChatEvent>}
   */
  const runReflection = async function* runReflection(reflectorAgent) {
    await Promise.resolve();
    const gate = makeToolGate({
      memorySet: {
        argKey: 'path',
        expected: [OBSERVATION_PATH, REFLECTION_PATH],
      },
    });

    // eslint-disable-next-line no-plusplus
    for (let attempt = 0, limit = 3; !gate.done() && attempt++ < limit; ) {
      // Clear any in-flight "doing" state left over from a retry round.
      gate.reset();
      try {
        const prompt = Array.from(
          buildReflectPrompt(attempt, gate.pending()),
        ).join('\n');
        // eslint-disable-next-line no-await-in-loop
        for await (const event of runAgent(reflectorAgent, prompt)) {
          gate.update(event);
          yield event;
        }
      } finally {
        // Flush the search index as an explicit sync point.
        if (searchBackend && searchBackend.sync) {
          // eslint-disable-next-line no-await-in-loop
          await searchBackend.sync();
        }
      }
    }
  };

  /**
   * Public API — begin a reflection cycle and return the event
   * stream.  See {@link Reflector}.`reflect`.
   *
   * Sets `running = true`, records an `inflight` promise tied to stream
   * completion, and clears both in a `finally` block so cleanup
   * happens whether the consumer drains fully or aborts early.
   *
   * Returns `undefined` if a reflection is already running.
   *
   * @returns {Promise<AsyncIterable<ChatEvent> | undefined>}
   */
  const reflect = async () => {
    await Promise.resolve();
    if (running) {
      return undefined;
    }

    running = true;
    /** @type {() => void} */
    let resolveInflight = () => {};
    inflight = new Promise(resolve => {
      resolveInflight = resolve;
    });

    /** @type {any} */
    let reflectorAgent;
    try {
      reflectorAgent = await makeAgent({
        model,
        workspaceDir,
        currentTime: new Date().toISOString(),
        listTools,
        execTool,
        disableSuffix: true,
        disablePolicy: true,
        systemPrompt: REFLECTOR_SYSTEM_PROMPT,
      });
    } catch (err) {
      running = false;
      inflight = null;
      resolveInflight();
      throw err;
    }

    const source = runReflection(reflectorAgent);

    async function* guarded() {
      await Promise.resolve();
      try {
        for await (const event of source) {
          publish(event);
          yield event;
        }
      } finally {
        running = false;
        inflight = null;
        // Always resolve — inflight is just a completion signal for
        // `stop()`; errors surface through the iterator itself.
        resolveInflight();
      }
    }
    return guarded();
  };

  /**
   * Run a reflection cycle unconditionally (e.g. from heartbeat).
   * Guards against concurrent runs and drains the event stream
   * silently.  Reflection failures are non-fatal — log and continue.
   *
   * @returns {Promise<void>}
   */
  const run = async () => {
    await Promise.resolve();
    /** @type {AsyncIterable<ChatEvent> | undefined} */
    let stream;
    try {
      stream = await reflect();
    } catch (err) {
      logError('[reflector] reflection failed:', err);
      return;
    }
    if (!stream) {
      return;
    }
    try {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of stream) {
        // Intentionally empty — drain silently for heartbeat /
        // auto-trigger paths.
      }
    } catch (err) {
      logError('[reflector] reflection failed:', err);
    }
  };

  /**
   * Check whether observations.md exceeds the token threshold and
   * trigger reflection if so.
   *
   * @returns {Promise<boolean>} True if reflection was triggered.
   */
  const checkAndRun = async () => {
    if (running) {
      return false;
    }

    const tokenCount = await estimateFileTokens(memoryGet, OBSERVATION_PATH);

    if (tokenCount >= reflectionThreshold) {
      await run();
      return true;
    }

    return false;
  };

  /** Stop the reflector and wait for any in-flight work. */
  const stop = async () => {
    await Promise.resolve();
    if (inflight) {
      await inflight;
    }
  };

  return harden({
    run,
    checkAndRun,
    reflect,
    stop,
    subscribe,
    isRunning: () => running,
  });
};
harden(makeReflector);

export {
  makeReflector,
  REFLECTOR_SYSTEM_PROMPT,
  DEFAULT_REFLECTION_THRESHOLD,
  estimateFileTokens,
};
