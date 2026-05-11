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
 *
 * ## Event subscribers
 *
 * Callers can register handlers via `subscribe(handler)`
 * to receive every `ChatEvent` emitted by the sub-agent —
 * regardless of whether the cycle was caller-driven (`observe()`)
 * or automatic (`check()` / `onIdle()` / heartbeat).
 *
 * Handler errors are caught and logged;
 * a throwing subscriber cannot stall the stream or affect other subscribers.
 */

import harden from '@endo/harden';

import { clearTimeout, setTimeout } from 'node:timers';

/** @import { Tool } from '../tools/common.js' */
/** @import { SearchBackend } from '../tools/memory.js' */
/** @import { ChatEvent } from '../agent/index.js' */
/** @import { Agent as PiAgent } from '@mariozechner/pi-agent-core' */

import { makePiAgent, runAgentRound } from '../agent/index.js';
import { makeToolGate } from '../agent/tool-gate.js';
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

const OBSERVATION_PATH = 'memory/observations.md';

/**
 * System prompt for the observer PiAgent.
 *
 * Instructs the agent to extract discrete, prioritised observations
 * from conversation messages and write them to `observations.md`.
 */
const OBSERVER_SYSTEM_PROMPT = `You are an observation extractor.
Your only job is to read conversation messages and compress them into
discrete, prioritised observations stored in ${OBSERVATION_PATH}.

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
- Do NOT duplicate information already in ${OBSERVATION_PATH}.
- Preserve the existing content; append new date sections or merge
  into the current day's section.
- When updating a day that already exists, merge new observations
  into that day's list — do not create a duplicate date header.
- Always update the "Current Context" section to reflect the latest
  state.
`;
harden(OBSERVER_SYSTEM_PROMPT);

/**
 * @param {number} attempt
 * @param {string} excerpt
 */
function* buildObservePrompt(attempt, excerpt) {
  if (attempt === 1) {
    yield 'Extract observations from the following conversation excerpt.';

    yield `Use memoryGet to read ${OBSERVATION_PATH} (it may not exist yet).`;
    yield 'Analyse the conversation excerpt below.';
    yield 'Extract discrete facts, decisions, preferences, and current task context.';
    yield 'Skip any information already present in the existing observations.';
    yield 'Format new observations following the structure below.';
    yield `Use memorySet to write the updated ${OBSERVATION_PATH} (or create it).`;
    yield 'Reply with just "OBSERVE_OK" unless you encounter errors.';
    yield '';
    yield '# Conversation Excerpt';
    yield '';
    yield excerpt;
  } else {
    yield `Try again, you forgot to actually use the memorySet tool on ${OBSERVATION_PATH}.`;
  }
}
harden(buildObservePrompt);

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
          if (block.type === 'thinking' && block.thinking)
            return block.thinking;
          if (block.type === 'toolCall') {
            return `[tool: ${block.name}(${typeof block.input === 'string' ? block.input : JSON.stringify(block.input)})]`;
          }
          if (block.type === 'toolResult') {
            const result =
              typeof block.result === 'string'
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
 * @property {string} workspaceDir - Workspace directory path.
 * @property {(opts: any) => Promise<PiAgent>} [makeAgent] - Optional
 *   PiAgent factory.  Defaults to `makePiAgent`.  Exposed so tests
 *   can inject a stub without standing up a live LLM.
 * @property {(agent: any, prompt: string) => AsyncIterable<ChatEvent>} [runAgent]
 *   - Optional per-round event runner.  Defaults to `runAgentRound`.
 *   Exposed so tests can inject a stub event stream without a live
 *   LLM.
 * @property {(...args: any[]) => void} [logError] - Optional structured
 *   error logger.  Defaults to `console.error`.  Exposed so tests can
 *   capture observation-failure and subscriber-isolation log lines
 *   without trying to reassign the (frozen-under-SES) global console.
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
 * @property {(mainAgent: any) => Promise<AsyncIterable<ChatEvent> | undefined>} observe
 *   - Begin an observation cycle and return an async iterable of the
 *   sub-agent's ChatEvents.  Returns `undefined` if an observation is
 *   already running, there are no unobserved messages, or the
 *   unobserved messages serialize to an empty excerpt (in which case
 *   `hwm` is advanced past them so the next trigger does not re-enter).
 *   Rejects if the underlying `makeAgent` call throws, with
 *   `running` / `inflight` cleared before the rejection propagates.
 *   Callers must drain the returned iterable to completion for the
 *   high-water mark to advance; aborting early still clears the
 *   `running` flag.
 * @property {() => boolean} isRunning - Whether an observation cycle
 *   is currently in progress.
 * @property {() => number} highWaterMark - Current high-water mark
 *   (message index).
 * @property {(handler: (event: ChatEvent) => void) => () => void} subscribe
 *   - Register a handler that receives every ChatEvent emitted by the
 *   sub-agent regardless of whether the cycle was caller-driven
 *   (`observe()`) or automatic (`check` / `onIdle` / heartbeat).
 *   Returns an idempotent unsubscribe function.  Handler errors are
 *   caught and logged; a throwing handler cannot stall the sub-agent
 *   stream or affect other subscribers.
 */

/**
 * Create an observer that compresses conversation into prioritised
 * observations.
 *
 * @param {ObserverOptions} options
 * @returns {Observer}
 */
const makeObserver = options => {
  const {
    model,
    tokenThreshold = DEFAULT_TOKEN_THRESHOLD,
    idleDelayMs = DEFAULT_IDLE_DELAY_MS,
    memoryGet,
    memorySet,
    searchBackend,
    workspaceDir,
    makeAgent = makePiAgent,
    runAgent = runAgentRound,
    logError = (...args) => console.error(...args),
  } = options;

  /** High-water mark: index of the first unobserved message. */
  let hwm = 0;

  /** Whether an observation cycle is currently running. */
  let running = false;

  /** Promise for the current in-flight observation. */
  /** @type {Promise<void> | null} */
  let inflight = null;

  /**
   * Promise for the most recent auto-trigger IIFE.  Captured
   * synchronously so `stop()` can wait for an auto-triggered cycle
   * that hasn't yet had a chance to set `inflight`.
   *
   * @type {Promise<void> | null}
   */
  let pendingTrigger = null;

  /** Idle timer handle. */
  /** @type {ReturnType<typeof setTimeout> | null} */
  let idleTimer = null;

  /** @type {Set<(event: ChatEvent) => void>} */
  const subscribers = new Set();

  /** @param {ChatEvent} event */
  const publish = event => {
    for (const handler of subscribers) {
      try {
        handler(event);
      } catch (err) {
        logError('[observer] subscriber failed:', err);
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
  });

  const listTools = () => [
    { name: 'memoryGet', summary: memoryGet.help() },
    { name: 'memorySet', summary: memorySet.help() },
  ];

  /**
   * @param {string} name
   * @param {any} args
   */
  const execTool = async (name, args) => {
    const tool = toolMap[name];
    if (!tool) {
      throw new Error(`Observer: unknown tool ${name}`);
    }
    return tool.execute(args);
  };

  /**
   * Run a single observation cycle, yielding the sub-agent's
   * ChatEvents as they arrive.
   *
   * Post-run cleanup (`searchBackend.sync`) happens in the `finally`
   * block so it fires whether the caller fully drains the iterable or
   * aborts early.  `hwm` is advanced at the end iff the sub-agent
   * succeeded in writing observations.md; partial success on abort is
   * accepted because observer output is best-effort.
   *
   * The sub-agent, messages, and serialised excerpt are all hoisted
   * into `beginObservation()` so that `makeAgent()` failures surface
   * as a synchronous-looking rejection from `observe()` rather than
   * lazily on first iteration, and so the empty-excerpt short-circuit
   * can advance `hwm` without entering a cycle at all.
   *
   * @param {any} observerAgent - Pre-constructed observer PiAgent.
   * @param {Array<any>} messages - The main agent's message array.
   * @param {string} excerpt - Non-empty serialised conversation
   *   excerpt.  The empty-excerpt case is handled in
   *   `beginObservation()` and never reaches this helper.
   * @returns {AsyncIterable<ChatEvent>}
   */
  const runObservation = async function* runObservation(
    observerAgent,
    messages,
    excerpt,
  ) {
    await Promise.resolve();

    const gate = makeToolGate({
      memorySet: {
        argKey: 'path',
        expected: [OBSERVATION_PATH],
      },
    });

    // eslint-disable-next-line no-plusplus
    for (let attempt = 0, limit = 3; !gate.done() && attempt++ < limit; ) {
      // Clear any in-flight "doing" state left over from a retry round.
      gate.reset();
      try {
        const prompt = Array.from(buildObservePrompt(attempt, excerpt)).join(
          '\n',
        );
        // eslint-disable-next-line no-await-in-loop
        for await (const event of runAgent(observerAgent, prompt)) {
          gate.update(event);
          yield event;
        }
      } finally {
        // Flush the search index as an explicit sync point.  Runs on
        // both normal completion and consumer-abort via generator
        // return(), mirroring the reflector's post-run sync.
        if (searchBackend && searchBackend.sync) {
          // eslint-disable-next-line no-await-in-loop
          await searchBackend.sync();
        }
      }
    }

    // If observer succeeded, advance the high-water mark to the end of
    // the messages we just observed.  When the consumer aborts early,
    // the generator unwinds via the `finally` above and this line is
    // skipped — partial progress that didn't complete a memorySet is
    // discarded on purpose: retrying the same range is safe.
    if (gate.done()) {
      hwm = messages.length;
    }
  };

  /**
   * Build the concurrency-guarded observation stream used by both the
   * explicit `observe()` API and the fire-and-forget
   * `triggerObservation()` auto-trigger path.  Sets `running = true`,
   * records an `inflight` promise tied to stream completion, and
   * clears both in a `finally` block so cleanup happens whether the
   * consumer drains fully or aborts early.
   *
   * Returns `undefined` if an observation is already running, there
   * are no unobserved messages, or the unobserved messages serialize
   * to an empty excerpt.  In the empty-excerpt case `hwm` is advanced
   * past the empty range so subsequent triggers do not re-enter.
   *
   * `makeAgent` is awaited eagerly here — mirroring the reflector's
   * eager-construction shape — so factory failures surface as a
   * promise rejection from `beginObservation` itself rather than
   * lazily when the consumer first iterates the returned stream.
   * `running` / `inflight` are unwound before the rejection
   * propagates so a failed observer cannot leave the instance stuck.
   *
   * @param {PiAgent} mainAgent - The main PiAgent instance.
   * @returns {Promise<AsyncIterable<ChatEvent> | undefined>}
   */
  const beginObservation = async mainAgent => {
    await Promise.resolve();

    if (running) {
      return undefined;
    }
    const { messages } = mainAgent.state;
    const fromIndex = hwm;
    if (fromIndex >= messages.length) {
      return undefined;
    }

    const excerpt = serializeMessages(messages, fromIndex);
    if (!excerpt.trim()) {
      // Nothing serialisable in the unobserved range — treat it as
      // fully observed so the next trigger does not re-enter for the
      // same empty messages.  Without this advance, the outer caller
      // (auto-trigger or explicit) would repeatedly build a new
      // stream that returns immediately, wasting a `makeAgent` call
      // each time and never letting `hwm` catch up.
      hwm = messages.length;
      return undefined;
    }

    running = true;
    /** @type {(() => void)} */
    let resolveInflight = () => {};
    inflight = new Promise(resolve => {
      resolveInflight = resolve;
    });

    /** @type {any} */
    let observerAgent;
    try {
      observerAgent = await makeAgent({
        model,
        workspaceDir,
        currentTime: new Date().toISOString(),
        listTools,
        execTool,
        disableSuffix: true,
        disablePolicy: true,
        systemPrompt: OBSERVER_SYSTEM_PROMPT,
      });
    } catch (err) {
      running = false;
      inflight = null;
      resolveInflight();
      throw err;
    }

    const source = runObservation(observerAgent, messages, excerpt);

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
   * Public API — begin an observation cycle and return the event
   * stream.  See {@link Observer}.`observe`.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   * @returns {Promise<AsyncIterable<ChatEvent> | undefined>}
   */
  const observe = mainAgent => beginObservation(mainAgent);

  /**
   * Fire-and-forget wrapper used by the auto-trigger paths
   * (`check`, `onIdle`, heartbeat).  Drives the stream to completion
   * in the background; event output is discarded for auto-triggers
   * but subscribers still receive every event via `publish()` inside
   * `guarded()`.  Since `beginObservation()` is now async — it awaits
   * `makeAgent()` eagerly — the stream acquisition also happens
   * inside the detached drain so `makeAgent` failures are logged
   * the same way as stream-iteration failures, without surfacing to
   * the synchronous caller of `check()` / `onIdle()`.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const triggerObservation = mainAgent => {
    // Capture the IIFE promise synchronously so `stop()` can wait for
    // an auto-triggered cycle even when it is called before
    // `beginObservation()` has had a chance to set `inflight`.
    pendingTrigger = (async () => {
      await Promise.resolve();
      /** @type {AsyncIterable<ChatEvent> | undefined} */
      let stream;
      try {
        stream = await beginObservation(mainAgent);
      } catch (err) {
        // `makeAgent` failures are non-fatal — log and continue.
        logError('[observer] observation failed:', err);
        return;
      }
      if (!stream) {
        return;
      }
      try {
        // eslint-disable-next-line no-unused-vars
        for await (const _ of stream) {
          // Intentionally empty — drain to completion silently.
        }
      } catch (err) {
        // Observation failures are non-fatal — log and continue.
        logError('[observer] observation failed:', err);
      }
    })().finally(() => {
      // Clear the slot so the next stop() does not await stale work.
      pendingTrigger = null;
    });
  };

  /**
   * Check whether the token threshold has been exceeded and trigger
   * observation if so.
   *
   * @param {any} mainAgent - The main PiAgent instance.
   */
  const check = mainAgent => {
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
   * @param {PiAgent} mainAgent - The main PiAgent instance.
   */
  const onIdle = mainAgent => {
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
   * @param {PiAgent} mainAgent - The main PiAgent instance.
   */
  const scheduleIdle = mainAgent => {
    resetIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      onIdle(mainAgent);
    }, idleDelayMs);
  };

  /** Stop the observer and wait for any in-flight work. */
  const stop = async () => {
    await Promise.resolve();
    resetIdleTimer();
    // Wait first for any auto-trigger IIFE to finish — its async tail
    // is what ultimately sets and clears `inflight` — then drain
    // whatever explicit observation is still in flight.
    if (pendingTrigger) {
      await pendingTrigger;
    }
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
    observe,
    subscribe,
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
