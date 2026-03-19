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
 */

/** @import { Tool } from '../tools/common.js' */
/** @import { SearchBackend } from '../tools/memory.js' */

import { makePiAgent, runAgentRound } from '../agent/index.js';
import { estimateTokens } from '../utils/tokens.js';

/**
 * Default token threshold for observations.md that triggers
 * reflection.
 */
const DEFAULT_REFLECTION_THRESHOLD = 40_000;
harden(DEFAULT_REFLECTION_THRESHOLD);

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

1. Use memoryGet to read memory/observations.md.
2. Use memoryGet to read memory/reflections.md (may not exist yet).
3. Use memoryGet to read memory/profile.md (may not exist yet).
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
   - Use memorySet to write the pruned memory/observations.md.
   - Use memorySet to write the updated memory/reflections.md.
   - If profile changed, use memorySet to write memory/profile.md.

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
 * Estimate the token count of a memory file's content.
 *
 * @param {Tool} memoryGet - The memoryGet tool instance.
 * @param {string} path - Memory-relative path to the file.
 * @returns {Promise<number>} Estimated token count (0 if file
 *   does not exist).
 */
const estimateFileTokens = async (memoryGet, path) => {
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
 * @property {string} [workspaceDir] - Workspace directory path.
 */

/**
 * @typedef {object} Reflector
 * @property {() => Promise<void>} run - Run a reflection cycle
 *   unconditionally (e.g. from heartbeat).
 * @property {() => Promise<boolean>} checkAndRun - Check whether
 *   observations.md exceeds the token threshold and run reflection
 *   if so.  Returns true if reflection was triggered.
 * @property {() => Promise<void>} stop - Stop the reflector and
 *   wait for any in-flight reflection to complete.
 * @property {() => boolean} isRunning - Whether a reflection cycle
 *   is currently in progress.
 */

/**
 * Create a reflector that consolidates observations into long-term
 * knowledge.
 *
 * @param {ReflectorOptions} options
 * @returns {Reflector}
 */
const makeReflector = (options) => {
  const {
    model,
    reflectionThreshold = DEFAULT_REFLECTION_THRESHOLD,
    memoryGet,
    memorySet,
    memorySearch,
    searchBackend,
    workspaceDir = process.cwd(),
  } = options;

  /** Whether a reflection cycle is currently running. */
  let running = false;

  /** Promise for the current in-flight reflection. */
  /** @type {Promise<void> | null} */
  let inflight = null;

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
    { name: 'memoryGet', summary: memoryGet.desc() },
    { name: 'memorySet', summary: memorySet.desc() },
    { name: 'memorySearch', summary: memorySearch.desc() },
  ];

  /** @param {string} name @param {any} args */
  const execTool = async (name, args) => {
    const tool = toolMap[name];
    if (!tool) {
      throw new Error(`Reflector: unknown tool ${name}`);
    }
    return tool.execute(args);
  };

  /**
   * Run a single reflection cycle.
   *
   * @returns {Promise<void>}
   */
  const runReflection = async () => {
    const reflectorAgent = await makePiAgent({
      model,
      workspaceDir,
      currentTime: new Date().toISOString(),
      listTools,
      execTool,
      disableSuffix: true,
      disablePolicy: true,
      systemPrompt: REFLECTOR_SYSTEM_PROMPT,
    });

    const prompt =
      'Run a full reflection cycle: read observations and reflections, ' +
      'consolidate, prune stale entries, promote durable facts, and ' +
      'update the profile if identity-level facts changed.';

    // Drain the async generator to completion.
    // eslint-disable-next-line no-unused-vars
    for await (const _event of runAgentRound(reflectorAgent, prompt)) {
      // Intentionally empty — let the reflector run to completion.
    }

    // Flush the search index as an explicit sync point.
    if (searchBackend && searchBackend.sync) {
      await searchBackend.sync();
    }
  };

  /**
   * Run a reflection cycle unconditionally (e.g. from heartbeat).
   * Guards against concurrent runs.
   *
   * @returns {Promise<void>}
   */
  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    inflight = runReflection()
      .catch(err => {
        // Reflection failures are non-fatal — log and continue.
        console.error('[reflector] reflection failed:', err);
      })
      .finally(() => {
        running = false;
        inflight = null;
      });

    await inflight;
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

    const tokenCount = await estimateFileTokens(
      memoryGet,
      'memory/observations.md',
    );

    if (tokenCount >= reflectionThreshold) {
      await run();
      return true;
    }

    return false;
  };

  /** Stop the reflector and wait for any in-flight work. */
  const stop = async () => {
    if (inflight) {
      await inflight;
    }
  };

  return harden({
    run,
    checkAndRun,
    stop,
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
