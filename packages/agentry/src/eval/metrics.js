// @ts-check
/// <reference types="ses"/>

/** @import { AgentEvent } from '@earendil-works/pi-agent-core' */
/** @import { AssistantMessage, Usage } from '@earendil-works/pi-ai' */
/** @import { RunMetrics, RunUsageMetrics } from './types.js' */

/**
 * @returns {RunUsageMetrics}
 */
const makeEmptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  totalTokens: 0,
  cost: { total: 0 },
});

/**
 * @param {unknown} message
 * @returns {message is AssistantMessage}
 */
const isAssistantMessage = message =>
  typeof message === 'object' &&
  message !== null &&
  /** @type {{ role?: unknown }} */ (message).role === 'assistant' &&
  typeof (/** @type {{ usage?: unknown }} */ (message).usage) === 'object' &&
  /** @type {{ usage?: unknown }} */ (message).usage !== null;

/**
 * @param {RunUsageMetrics} target
 * @param {Usage & { reasoning?: number }} usage
 */
const addUsage = (target, usage) => {
  target.input += usage.input;
  target.output += usage.output;
  target.cacheRead += usage.cacheRead;
  target.cacheWrite += usage.cacheWrite;
  target.reasoning += usage.reasoning ?? 0;
  target.totalTokens += usage.totalTokens;
  target.cost.total += usage.cost.total;
};

/**
 * Record per-run metrics from plain pi-agent-core events.
 *
 * The recorder is intentionally independent of code mode: any Agent that emits
 * the public AgentEvent shape can be measured with this listener.
 *
 * @returns {{
 *   listener: (event: AgentEvent) => void,
 *   snapshot: () => RunMetrics,
 * }}
 */
export const makeRunMetricsRecorder = () => {
  /** @type {number | undefined} */
  let startedAt;
  /** @type {number | undefined} */
  let endedAt;
  const usage = makeEmptyUsage();
  let turns = 0;
  let assistantMessages = 0;
  let toolExecutions = 0;
  let toolExecutionErrors = 0;

  /**
   * @param {AgentEvent} event
   */
  const listener = event => {
    switch (event.type) {
      case 'agent_start': {
        startedAt ??= Date.now();
        endedAt = undefined;
        break;
      }
      case 'agent_end': {
        endedAt = Date.now();
        break;
      }
      case 'turn_end': {
        turns += 1;
        break;
      }
      case 'message_end': {
        if (isAssistantMessage(event.message)) {
          assistantMessages += 1;
          addUsage(usage, event.message.usage);
        }
        break;
      }
      case 'tool_execution_end': {
        toolExecutions += 1;
        if (event.isError) {
          toolExecutionErrors += 1;
        }
        break;
      }
      default:
    }
  };

  const snapshot = () => {
    const wallTimeMs =
      startedAt === undefined ? 0 : (endedAt ?? Date.now()) - startedAt;
    return harden({
      usage: {
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        reasoning: usage.reasoning,
        totalTokens: usage.totalTokens,
        cost: { total: usage.cost.total },
      },
      turns,
      assistantMessages,
      toolExecutions,
      toolExecutionErrors,
      wallTimeMs,
    });
  };

  return harden({ listener, snapshot });
};
harden(makeRunMetricsRecorder);
