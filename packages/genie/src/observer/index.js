// @ts-check

/**
 * Observer Module
 *
 * Compresses conversation into prioritised observations stored in
 * `observations.md`.  Runs as a background PiAgent instance with a
 * focused system prompt and minimal tool set (memoryGet + memorySet).
 *
 * Two trigger conditions:
 * 1. **Token threshold** — unobserved message tokens exceed a
 *    configurable limit (default 30 000).
 * 2. **Idle timer** — fires during conversational pauses.
 *
 * The observer only writes to `observations.md` via `memorySet`;
 * the main agent does not read that file mid-conversation, so
 * concurrent execution is safe.
 */

/** @import { Tool } from '../tools/common.js' */
/** @import { SearchBackend } from '../tools/memory.js' */

import { makePiAgent, getMessageTokenCount, runAgentRound } from '../agent/index.js';
import { estimateTokens } from '../utils/tokens.js';

/**
 * Default token threshold before the observer fires.
 */
const DEFAULT_TOKEN_THRESHOLD = 30_000;
harden(DEFAULT_TOKEN_THRESHOLD);

/**
 * Default idle delay in milliseconds (2 minutes).
 */
const DEFAULT_IDLE_DELAY_MS = 2 * 60 * 1000;
harden(DEFAULT_IDLE_DELAY_MS);

/**
 * System prompt for the observer PiAgent.
 *
 * Instructs the agent to extract discrete, prioritised observations
 * from conversation messages and write them to `observations.md`.
 */
const OBSERVER_SYSTEM_PROMPT = `You are an observation extractor.
Your only job is to read conversation messages and compress them into
discrete, prioritised observations stored in memory/observations.md.

## Process

1. Use memoryGet to read memory/observations.md (it may not exist yet).
2. Analyse the conversation messages provided in the user prompt.
3. Extract discrete facts, decisions, preferences, and current task context.
4. Skip any information already present in the existing observations.
5. Format new observations following the structure below.
6. Use memorySet to write the updated observations.md.

## Observation format

Group observations by date with a "Current Context" section:

\`\`\`markdown
## YYYY-MM-DD

### Current Context
- **Active task:** <brief description>
- **Key entities:** <comma-separated>

### Observations
- 🔴 HH:MM <critical fact — blocks work or captures a key decision>
- 🟡 HH:MM <contextual fact — relevant to active tasks>
- 🟢 HH:MM <informational — nice to know>
\`\`\`

## Priority levels

- 🔴 critical — blocks current work or captures a key decision
- 🟡 contextual — relevant to active tasks
- 🟢 informational — nice to know, lowest retention priority

## Rules

- Be concise — aim for 5–40× compression of the source messages.
- Each observation must be a single, self-contained fact.
- Do NOT duplicate information already in observations.md.
- Preserve the existing content; append new date sections or merge
  into the current day's section.
- When updating a day that already exists, merge new observations
  into that day's list — do not create a duplicate date header.
- Always update the "Current Context" section to reflect the latest
  state.
`;
harden(OBSERVER_SYSTEM_PROMPT);

/**
 * Serialize messages from a PiAgent's state into a string suitable
 * for the observer prompt.  Only includes messages from index
 * `fromIndex` onward.
 *
 * @param {Array<any>} messages - The full message array from
 *   `piAgent.state.messages`.
 * @param {number} fromIndex - Start index (high-water mark).
 * @returns {string} Serialised conversation excerpt.
 */
const serializeMessages = (messages, fromIndex) => {
  const parts = [];
  for (let i = fromIndex; i < messages.length; i += 1) {
    const msg = messages[i];
    const role = msg.role || 'unknown';
    const { content } = msg;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map(block => {
          if (block.type === 'text' && block.text) return block.text;
          if (block.type === 'thinking' && block.thinking) return block.thinking;
          if (block.type === 'toolCall') {
            return `[tool: ${block.name}(${typeof block.input === 'string' ? block.input : JSON.stringify(block.input)})]`;
          }
          if (block.type === 'toolResult') {
            const result = typeof block.result === 'string'
              ? block.result
              : JSON.stringify(block.result);
            return `[result: ${result}]`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (text) {
      parts.push(`[${role}]: ${text}`);
    }
  }
  return parts.join('\n\n');
};
harden(serializeMessages);

/**
 * Estimate the token count of messages starting from `fromIndex`.
 *
 * @param {Array<any>} messages - Full message array.
 * @param {number} fromIndex - Start index.
 * @returns {number} Estimated token count.
 */
const estimateUnobservedTokens = (messages, fromIndex) => {
  let total = 0;
  for (let i = fromIndex; i < messages.length; i += 1) {
    const msg = messages[i];
    const { content } = msg;
    if (typeof content === 'string') {
      total += estimateTokens(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          total += estimateTokens(block.text);
        } else if (block.type === 'thinking' && block.thinking) {
          total += estimateTokens(block.thinking);
        } else if (block.type === 'toolCall' && block.input !== undefined) {
          total += estimateTokens(
            typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input),
          );
        } else if (block.type === 'toolResult') {
          total += estimateTokens(
            typeof block.result === 'string'
              ? block.result
              : JSON.stringify(block.result),
          );
        }
      }
    }
  }
  return total;
};
harden(estimateUnobservedTokens);

/**
 * @typedef {object} ObserverOptions
 * @property {string} [model] - Model string for the observer agent.
 *   Defaults to the main chat model.
 * @property {number} [tokenThreshold] - Token count threshold that
 *   triggers observation.  Default 30 000.
 * @property {number} [idleDelayMs] - Idle delay in ms before
 *   opportunistic observation.  Default 120 000 (2 min).
 * @property {Tool} memoryGet - The memoryGet tool instance.
 * @property {Tool} memorySet - The memorySet tool instance.
 * @property {SearchBackend} [searchBackend] - Search backend for
 *   post-observation sync.
 * @property {string} [workspaceDir] - Workspace directory path.
 */

/**
 * @typedef {object} Observer
 * @property {(mainAgent: any) => void} check - Check whether
 *   observation should trigger based on token threshold.
 * @property {(mainAgent: any) => void} onIdle - Notify the observer
 *   that the conversation is idle.
 * @property {() => void} resetIdleTimer - Reset the idle timer
 *   (call when user sends a new message).
 * @property {() => Promise<void>} stop - Stop the observer and wait
 *   for any in-flight observation to complete.
 * @property {(mainAgent: any) => void} scheduleIdle - Schedule an
 *   idle observation after the configured delay.
 * @property {() => boolean} isRunning - Whether an observation cycle
 *   is currently in progress.
 * @property {() => number} highWaterMark - Current high-water mark
 *   (message index).
 */

/**
 * Create an observer that compresses conversation into prioritised
 * observations.
 *
 * @param {ObserverOptions} options
 * @returns {Observer}
 */
const makeObserver = (options) => {
  const {
    model,
    tokenThreshold = DEFAULT_TOKEN_THRESHOLD,
    idleDelayMs = DEFAULT_IDLE_DELAY_MS,
    memoryGet,
    memorySet,
    searchBackend,
    workspaceDir = process.cwd(),
  } = options;

  /** High-water mark: index of the first unobserved message. */
  let hwm = 0;

  /** Whether an observation cycle is currently running. */
  let running = false;

  /** Promise for the current in-flight observation. */
  /** @type {Promise<void> | null} */
  let inflight = null;

  /** Idle timer handle. */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;

  /**
   * Build the tool-list and exec-tool functions expected by
   * `makePiAgent`.
   */
  const toolMap = harden({
    memoryGet,
    memorySet,
  });

  const listTools = () => [
    { name: 'memoryGet', summary: memoryGet.desc() },
    { name: 'memorySet', summary: memorySet.desc() },
  ];

  /** @param {string} name @param {any} args */
  const execTool = async (name, args) => {
    const tool = toolMap[name];
    if (!tool) {
      throw new Error(`Observer: unknown tool ${name}`);
    }
    return tool.execute(args);
  };

  /**
   * Run a single observation cycle.
   *
   * @param {Array<any>} messages - The main agent's message array.
   * @param {number} fromIndex - Start index for unobserved messages.
   * @returns {Promise<void>}
   */
  const runObservation = async (messages, fromIndex) => {
    const excerpt = serializeMessages(messages, fromIndex);
    if (!excerpt.trim()) {
      return;
    }

    const observerAgent = await makePiAgent({
      model,
      workspaceDir,
      currentTime: new Date().toISOString(),
      listTools,
      execTool,
      disableSuffix: true,
      disablePolicy: true,
      systemPrompt: OBSERVER_SYSTEM_PROMPT,
    });

    const prompt = `Extract observations from the following conversation excerpt.\n\n${excerpt}`;

    // Drain the async generator to completion — we don't need events.
    // eslint-disable-next-line no-unused-vars
    for await (const _event of runAgentRound(observerAgent, prompt)) {
      // Intentionally empty — let the observer run to completion.
    }

    // Flush the search index as an explicit sync point.
    if (searchBackend && searchBackend.sync) {
      await searchBackend.sync();
    }

    // Advance the high-water mark to the end of the messages we
    // just observed.
    hwm = messages.length;
  };

  /**
   * Fire-and-forget wrapper around `runObservation` that guards
   * against concurrent runs.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const triggerObservation = (mainAgent) => {
    if (running) {
      return;
    }

    const { messages } = mainAgent.state;
    const fromIndex = hwm;

    if (fromIndex >= messages.length) {
      return;
    }

    running = true;
    inflight = runObservation(messages, fromIndex)
      .catch(err => {
        // Observation failures are non-fatal — log and continue.
        console.error('[observer] observation failed:', err);
      })
      .finally(() => {
        running = false;
        inflight = null;
      });
  };

  /**
   * Check whether the token threshold has been exceeded and trigger
   * observation if so.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const check = (mainAgent) => {
    if (running) {
      return;
    }
    const { messages } = mainAgent.state;
    const unobservedTokens = estimateUnobservedTokens(messages, hwm);
    if (unobservedTokens >= tokenThreshold) {
      triggerObservation(mainAgent);
    }
  };

  /**
   * Notify the observer that the conversation is idle — trigger
   * opportunistic observation if there are unobserved messages.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const onIdle = (mainAgent) => {
    if (running) {
      return;
    }
    const { messages } = mainAgent.state;
    if (hwm < messages.length) {
      triggerObservation(mainAgent);
    }
  };

  /** Reset the idle timer (call when the user sends a new message). */
  const resetIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  /**
   * Schedule an idle observation after `idleDelayMs`.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const scheduleIdle = (mainAgent) => {
    resetIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      onIdle(mainAgent);
    }, idleDelayMs);
  };

  /** Stop the observer and wait for any in-flight work. */
  const stop = async () => {
    resetIdleTimer();
    if (inflight) {
      await inflight;
    }
  };

  return harden({
    check,
    onIdle,
    resetIdleTimer,
    scheduleIdle,
    stop,
    isRunning: () => running,
    highWaterMark: () => hwm,
  });
};
harden(makeObserver);

export {
  makeObserver,
  OBSERVER_SYSTEM_PROMPT,
  DEFAULT_TOKEN_THRESHOLD,
  DEFAULT_IDLE_DELAY_MS,
  estimateUnobservedTokens,
  serializeMessages,
};
