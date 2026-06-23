// @ts-check
/* eslint-disable no-continue, no-await-in-loop */
/**
 * Single-round driver for a `@earendil-works/pi-agent-core` `Agent` instance.
 *
 * This module vendors the subset of the agent harness that lal exercises:
 * the streaming bridge from a PiAgent's internal event stream onto a
 * narrower `ChatEvent` shape that `agent.js` switches on. It was previously
 * imported from `@endo/genie`'s public surface (`runAgentRound`); per
 * kriskowal's review on PR #290 the various agent-harness experiments
 * (lal, genie, fae) should not inter-depend as they evolve in parallel,
 * so the few functions we use are copied here verbatim. The corresponding
 * upstream definitions live at `packages/genie/src/agent/index.js`.
 *
 * Powered by `@earendil-works/pi-agent-core` for LLM interaction and tool
 * dispatch.
 */

/** @import { AgentEvent } from '@earendil-works/pi-agent-core' */
/** @import { Agent as PiAgent } from '@earendil-works/pi-agent-core' */

/**
 * @param {never} nope
 * @param {string} wat
 */
function inconceivable(nope, wat) {
  throw new Error(`inconceivable ${wat}: ${nope}`);
}

/** @param {any} val */
const mayJSONify = val => (typeof val === 'string' ? val : JSON.stringify(val));

/**
 * ToolCallStart - Event emitted when starting a tool call
 *
 * @typedef {{ type: 'ToolCallStart', toolName: string, args: any }} ToolCallStart
 *
 * @param {string} toolName - Name of the tool being called
 * @param {any} args - Arguments passed to the tool
 * @returns {ToolCallStart}
 */
export function makeToolCallStart(toolName, args) {
  return harden({ type: 'ToolCallStart', toolName, args });
}
harden(makeToolCallStart);

/**
 * ToolCallEnd - Event emitted after a tool call completes
 *
 * @typedef {(
 * | { type: 'ToolCallEnd', toolName: string, error: Error }
 * | { type: 'ToolCallEnd', toolName: string, result: any }
 * )} ToolCallEnd
 *
 * @param {string} toolName - Name of the tool that was called
 * @param {any} result - Result of the tool call
 * @param {Error|null} [error] - Error if tool failed, null otherwise
 * @returns {ToolCallEnd}
 */
export function makeToolCallEnd(toolName, result, error = null) {
  return error
    ? harden({ type: 'ToolCallEnd', toolName, error })
    : harden({ type: 'ToolCallEnd', toolName, result });
}
harden(makeToolCallEnd);

/**
 * Message - Standard text-based response from the agent
 *
 * @typedef {{ type: 'Message', role: string, content: string }} AgentMessage
 *
 * @param {string} role - 'user', 'assistant', 'assistant_delta', or 'tool'
 * @param {string} content - Message content
 * @returns {AgentMessage}
 */
export function makeMessage(role, content) {
  return harden({ type: 'Message', role, content });
}
harden(makeMessage);

/**
 * AgentThinking - Reasoning/thinking content from the model
 *
 * Emitted when the model produces chain-of-thought reasoning (such as the
 * Anthropic extended-thinking and OpenAI reasoning-token streams). The
 * `role` distinguishes between a complete thinking block (`'thinking'`)
 * and an incremental streaming delta (`'thinking_delta'`).
 *
 * @typedef {{ type: 'Thinking', role: 'thinking' | 'thinking_delta', content: string, redacted?: boolean }} AgentThinking
 *
 * @param {'thinking' | 'thinking_delta'} role
 * @param {string} content - Thinking text (or delta fragment)
 * @param {boolean} [redacted] - True when the content was redacted by safety filters
 * @returns {AgentThinking}
 */
export function makeThinking(role, content, redacted = false) {
  return redacted
    ? harden({ type: 'Thinking', role, content, redacted })
    : harden({ type: 'Thinking', role, content });
}
harden(makeThinking);

/**
 * UserMessage - Event emitted when the user's prompt is echoed back
 *
 * @typedef {{ type: 'UserMessage', content: string }} UserMessage
 *
 * @param {string} content - The user's message content
 * @returns {UserMessage}
 */
export function makeUserMessage(content) {
  return harden({ type: 'UserMessage', content });
}
harden(makeUserMessage);

/**
 * Error - Error event (for error handling in the stream)
 *
 * @typedef {{ type: 'Error', message: string, cause: Error }} AgentError
 *
 * @param {string} message - Error message
 * @param {Error} cause - Underlying error
 * @returns {AgentError}
 */
export function makeError(message, cause) {
  return harden({ type: 'Error', message, cause });
}
harden(makeError);

/**
 * @typedef {(
 * | AgentError
 * | AgentMessage
 * | AgentThinking
 * | UserMessage
 * | ToolCallStart
 * | ToolCallEnd
 * )} ChatEvent
 */

/**
 * Run a single chat round on an already-constructed PiAgent, yielding
 * ChatEvent objects as they arrive.
 *
 * The caller is responsible for any pre/post-processing of the prompt and
 * final assistant text.
 *
 * @param {PiAgent} piAgent - A PiAgent instance.
 * @param {string} prompt - User prompt
 * @returns {AsyncGenerator<ChatEvent>}
 */
export async function* runAgentRound(piAgent, prompt) {
  await Promise.resolve();

  // Collect events via subscription for progressive yielding
  let agentDone = false;
  /**
   * @typedef {AgentEvent|{type: 'error', error: any}} QueueEvent
   * @type {Array<QueueEvent>}
   */
  const eventQueue = [];

  /** @type {((value?: any) => void) | null} */
  let resolveWaiting = null;

  /** @returns {Promise<void>} */
  const forQueue = () => {
    return new Promise(resolve => {
      resolveWaiting = resolve;
    });
  };

  /**
   * @param {QueueEvent} event
   * @param {boolean} [done]
   */
  const giveQueue = (event, done = false) => {
    eventQueue.push(event);
    if (!agentDone) {
      agentDone = done;
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }
  };

  piAgent.subscribe(event => giveQueue(event));

  // Start the prompt (non-blocking)
  const promptDone = piAgent
    .prompt(prompt)
    .then(
      () => giveQueue({ type: 'agent_start' }),
      err => giveQueue({ type: 'error', error: err }, true),
    )
    .catch(err => giveQueue({ type: 'error', error: err }, true));

  piAgent
    .waitForIdle()
    .then(
      () => giveQueue({ type: 'agent_end', messages: [] }, true),
      err => giveQueue({ type: 'error', error: err }, true),
    )
    .catch(err => giveQueue({ type: 'error', error: err }, true));

  // Process events as they arrive, yielding ChatEvent values
  let fullAssistantText = '';

  while (eventQueue.length > 0 || !agentDone) {
    if (eventQueue.length === 0) {
      await forQueue();
      continue;
    }

    const event = eventQueue.shift();
    if (!event) continue;

    switch (event.type) {
      case 'error': {
        yield makeError('LLM call failed', event.error);
        break;
      }

      case 'tool_execution_start': {
        yield makeToolCallStart(event.toolName, event.args);
        break;
      }

      case 'tool_execution_end': {
        yield event.isError
          ? makeToolCallEnd(
              event.toolName,
              null,
              event.isError
                ? new Error(
                    `Tool execution failed: ${mayJSONify(event.result)}`,
                  )
                : null,
            )
          : makeToolCallEnd(event.toolName, event.result);
        break;
      }

      case 'tool_execution_update': {
        // TODO care?
        break;
      }

      case 'message_start': {
        const { message } = event;

        switch (message.role) {
          case 'assistant': {
            const {
              // timestamp, TODO care?
              content,
            } = message;

            for (const part of content) {
              switch (part.type) {
                // TODO necessary?
                case 'text': {
                  fullAssistantText += part.text;
                  break;
                }

                case 'thinking': {
                  if (part.thinking) {
                    yield makeThinking(
                      'thinking',
                      part.thinking,
                      part.redacted,
                    );
                  }
                  break;
                }

                case 'toolCall': {
                  // TODO redundant with 'tool_execution_start'?
                  break;
                }

                default: {
                  inconceivable(part, 'pi agent message_start content part');
                }
              }
            }
            break;
          }

          case 'user': {
            // TODO care?
            break;
          }

          case 'toolResult': {
            // TODO care?
            break;
          }

          default: {
            // pi-agent-core 0.79+ defines additional message roles
            // (bashExecution, custom, branchSummary, compactionSummary)
            // that lal does not consume; ignore them silently rather
            // than treating them as inconceivable.
            break;
          }
        }
        break;
      }

      case 'message_update': {
        if (event.assistantMessageEvent) {
          const ame = event.assistantMessageEvent;
          // Stream text deltas as progressive Message events
          if (ame.type === 'text_delta') {
            fullAssistantText += ame.delta;
            yield makeMessage('assistant_delta', ame.delta);
          }
          // Stream thinking deltas as progressive Thinking events
          if (ame.type === 'thinking_delta') {
            yield makeThinking('thinking_delta', ame.delta);
          }
        }
        break;
      }

      case 'message_end':
        {
          const { message } = event;

          switch (message.role) {
            case 'assistant':
              {
                const { content, stopReason, errorMessage } = message;

                if (stopReason === 'error') {
                  // TODO care to differentiate? StopReason = "stop" | "length" | "toolUse" | "error" | "aborted"
                  yield makeError('LLM call stopped', new Error(errorMessage));
                }

                // Extract final text from assistant messages
                let text = '';
                if (typeof content === 'string') {
                  text = content;
                } else if (Array.isArray(content)) {
                  text = content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('');
                }
                if (text) {
                  fullAssistantText = text;
                }
              }
              break;

            case 'user':
              {
                const { content } = message;
                const userContent =
                  typeof content === 'string'
                    ? content
                    : Array.isArray(content)
                      ? content
                          .filter(c => c.type === 'text')
                          .map(c => c.text)
                          .join('')
                      : '';
                if (userContent) {
                  yield makeUserMessage(userContent);
                }
              }
              break;
            default:
              break;
          }
        }
        break;

      case 'agent_start': {
        // TODO care?
        break;
      }

      case 'agent_end': {
        // TODO care?
        //
        // TODO we could just reach in and pluck any final fullAssistantText
        // from event.messages rather than do our own accumulate?

        break;
      }

      case 'turn_start': {
        // TODO care?
        break;
      }

      case 'turn_end': {
        // TODO care?
        break;
      }

      default:
        inconceivable(event, 'pi agent event');
    }
  }

  // Wait for prompt to fully complete
  await promptDone;

  // Yield the final assembled assistant message
  if (fullAssistantText) {
    yield makeMessage('assistant', fullAssistantText);
  }
}
harden(runAgentRound);
