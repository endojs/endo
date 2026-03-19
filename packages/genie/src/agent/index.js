// @ts-check
/**
 * Genie Agent - Core agentic LLM calling harness
 *
 * This module implements an AI agent that handles:
 * - Session management
 * - Tool calls (bash, git, etc.)
 * - Memory integration
 * - Error handling and retry
 * - Streaming interface for tool execution
 *
 * Powered by @mariozechner/pi-agent-core for LLM interaction and tool dispatch.
 */

/** @import { AgentTool, AgentToolResult, AgentEvent } from '@mariozechner/pi-agent-core' */

import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';

import {
  default as buildSystemPrompt,
} from '../system/index.js';

/**
 * ToolCallStart - Event emitted when starting a tool call
 *
 * @param {string} toolName - Name of the tool being called
 * @param {any} args - Arguments passed to the tool
 */
export function makeToolCallStart(toolName, args) {
  return harden({ type: 'ToolCallStart', toolName, args });
}

/**
 * ToolCallEnd - Event emitted after a tool call completes
 *
 * @param {string} toolName - Name of the tool that was called
 * @param {any} result - Result of the tool call
 * @param {Error|null} [error=null] - Error if tool failed, null otherwise
 */
export function makeToolCallEnd(toolName, result, error = null) {
  return harden({ type: 'ToolCallEnd', toolName, result, error });
}

/**
 * Message - Standard text-based response from the agent
 *
 * @param {string} role - 'user', 'assistant', or 'tool'
 * @param {string} content - Message content
 */
export function makeMessage(role, content) {
  return harden({ type: 'Message', role, content });
}

/**
 * Error - Error event (for error handling in the stream)
 *
 * @param {string} message - Error message
 * @param {Error} cause - Underlying error
 */
export function makeError(message, cause) {
  return harden({ type: 'Error', message, cause });
}

harden(makeToolCallStart);
harden(makeToolCallEnd);
harden(makeMessage);
harden(makeError);

/** @typedef {object} ToolSpec
 * @prop {string} name
 * @prop {string} summary
 */

/**
 * Default model provider and model ID.
 * Can be overridden by passing a model string in the format "provider/modelId"
 * or just "modelId" (defaults to 'anthropic' provider).
 */
const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL_ID = 'claude-sonnet-4-20250514';

/**
 * Parse a model string into { provider, modelId }.
 *
 * Accepts:
 * - "provider/modelId" (e.g. "anthropic/claude-sonnet-4-20250514")
 * - "modelId" alone (uses DEFAULT_PROVIDER)
 * - "" or undefined (uses defaults)
 *
 * @param {string} [modelStr]
 * @returns {{ provider: string, modelId: string }}
 */
function parseModelString(modelStr) {
  if (!modelStr) {
    return { provider: DEFAULT_PROVIDER, modelId: DEFAULT_MODEL_ID };
  }
  const parts = modelStr.split('/');
  if (parts.length >= 2) {
    return { provider: parts[0], modelId: parts.slice(1).join('/') };
  }
  return { provider: DEFAULT_PROVIDER, modelId: modelStr };
}
harden(parseModelString);

/**
 * Convert a Genie ToolSpec + execTool into an AgentTool compatible with
 * pi-agent-core.
 *
 * @param {ToolSpec} spec
 * @param {(name: string, args: any) => Promise<any>} execTool
 * @returns {AgentTool<any>}
 */
function toAgentTool(spec, execTool) {
  return {
    name: spec.name,
    label: spec.name,
    description: spec.summary,
    // Accept any JSON object as parameters
    parameters: {
      type: 'object',
      additionalProperties: true,
    },
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const result = await execTool(spec.name, params);
      /** @type {AgentToolResult<any>} */
      const toolResult = {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
        details: result,
      };
      return toolResult;
    },
  };
}

/**
 * Create a Genie Agent instance
 *
 * @param {object} options - Agent configuration
 * @param {string} [options.hostname] - Hostname for system prompt
 * @param {string} [options.currentTime] - Current time string
 * @param {string} [options.workspaceDir] - Workspace directory path
 * @param {string} [options.model] - Model identifier ("provider/modelId" or just "modelId")
 * @param {() => Array<ToolSpec>} [options.listTools] - List of available tools with name and execute function
 * @param {(name: string, args: any) => Promise<any>} [options.execTool] - Function to execute a tool by name
 * @param {boolean} [options.disableSuffix] - Disable security suffix
 * @param {boolean} [options.disablePolicy] - Disable policy section
 * @param {boolean} [options.strictPolicy] - Enable strict policy
 * @param {string} [options.securityNotes] - Custom security notes
 * @param {(message: string) => string} [options.beforeSend] - Async callback before sending prompt to LLM
 * @param {(message: string) => string} [options.afterSend] - Async callback after LLM response
 * @returns {object} Agent instance
 */
export default function makeAgent(options = {}) {
  const {
    hostname = 'unknown',
    currentTime = 'unknown',
    workspaceDir = process.cwd(),
    model = '',
    listTools = () => [],
    execTool = (_name, _args) => Promise.reject(new Error(`unimplemented tool ${_name}`)),
    disableSuffix = false,
    disablePolicy = false,
    strictPolicy = false,
    securityNotes = '',
    beforeSend = async (prompt) => {
      console.info('[Agent] Sending prompt to LLM:', prompt.substring(0, 200) + '...');
      return prompt;
    },
    afterSend = async (response) => {
      console.info('[Agent] Received LLM response:', response.substring(0, 200) + '...');
      return response;
    },
  } = options;

  const systemPromptConfig = {
    hostname,
    currentTime,
    workspaceDir,
    buildToolList: listTools,
    disableSuffix,
    disablePolicy,
    strictPolicy,
    securityNotes,
  };

  // Resolve the pi-ai Model object from the model string
  const { provider, modelId } = parseModelString(model);
  const resolvedModel = getModel(provider, modelId);
  if (!resolvedModel) {
    throw new Error(
      `Unknown model: provider=${provider}, modelId=${modelId}. ` +
      `Pass a valid "provider/modelId" string (e.g. "anthropic/claude-sonnet-4-20250514").`,
    );
  }

  // ============================================================================
  // AGENT INTERFACE
  // ============================================================================

  /**
   * Execute a single chat round
   *
   * This method handles:
   * 1. User prompt -> LLM via pi-agent-core
   * 2. Tool calls dispatched and executed by pi-agent-core
   * 3. Streaming events yielded progressively
   * 4. Final assistant response
   *
   * Returns an AsyncIterator that yields events:
   * - ToolCallStart: When starting a tool call
   * - ToolCallEnd: When a tool call completes
   * - Message: Assistant responses or user messages (including streaming deltas)
   * - Error: Error events if something fails
   *
   * @param {object} input - Input parameters
   * @param {string} input.prompt - User prompt
   * @param {Array} [input.messages] - Previous message history (optional, for conversation)
   * @param {object} [input.tools] - Override tools for this call (optional)
   * @param {boolean} [input.disableMemory] - Disable memory integration (optional, default false)
   * @returns {AsyncGenerator} AsyncGenerator yielding events
   */
  async function* chatRound(input) {
    const {
      prompt,
      messages = [],
    } = input;

    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      yield makeError('prompt is required', new Error('Invalid input'));
      return;
    }

    // Build the system prompt
    const systemPrompt = Array.from(buildSystemPrompt(systemPromptConfig)).join('\n');

    // Get final tool list and convert to AgentTool format
    const finalToolList = Array.from(listTools());
    const agentTools = finalToolList.map(spec => toAgentTool(spec, execTool));

    // Convert existing messages to pi-agent-core format
    // pi-agent-core expects { role, content, timestamp } messages
    const piMessages = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp || Date.now(),
    }));

    // Run beforeSend callback with the prompt
    let processedPrompt;
    try {
      processedPrompt = await beforeSend(prompt);
    } catch (err) {
      yield makeError('beforeSend callback failed', /** @type {Error} */(err));
      return;
    }

    // Create a pi-agent-core Agent instance for this round
    const piAgent = new Agent({
      initialState: {
        systemPrompt,
        model: resolvedModel,
        tools: agentTools,
        messages: piMessages,
        thinkingLevel: 'off',
      },
      // Identity conversion - genie messages use standard roles
      convertToLlm: msgs => msgs.filter(m =>
        m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult',
      ),
      toolExecution: 'sequential',
    });

    // Collect events via subscription for progressive yielding
    /** @type {Array<AgentEvent|{type: 'error', error: any}>} */
    const eventQueue = [];
    let resolveWaiting = /** @type {((value?: any) => void) | null} */ (null);
    let agentDone = false;

    piAgent.subscribe(event => {
      eventQueue.push(event);
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    });

    // Start the prompt (non-blocking)
    const promptDone = piAgent.prompt(processedPrompt).then(
      () => {
        agentDone = true;
        if (resolveWaiting) {
          const resolve = resolveWaiting;
          resolveWaiting = null;
          resolve();
        }
      },
      err => {
        agentDone = true;
        eventQueue.push({ type: 'agent_end', messages: [] });
        if (resolveWaiting) {
          const resolve = resolveWaiting;
          resolveWaiting = null;
          resolve();
        }
        // Push a synthetic error for the generator to pick up
        eventQueue.push({ type: 'error', error: err });
      },
    );

    // Process events as they arrive, yielding Genie events
    let fullAssistantText = '';

    while (!agentDone || eventQueue.length > 0) {
      if (eventQueue.length === 0) {
        // Wait for next event
        await new Promise(resolve => {
          resolveWaiting = resolve;
        });
        continue;
      }

      const event = eventQueue.shift();
      if (!event) continue;

      switch (event.type) {
        case 'tool_execution_start':
          yield makeToolCallStart(event.toolName, event.args);
          break;

        case 'tool_execution_end':
          yield makeToolCallEnd(
            event.toolName,
            event.result,
            event.isError ? new Error('Tool execution failed') : null,
          );
          break;

        case 'message_update':
          // Stream text deltas as progressive Message events
          if (event.assistantMessageEvent &&
            event.assistantMessageEvent.type === 'text_delta') {
            const delta = event.assistantMessageEvent.delta;
            fullAssistantText += delta;
            yield makeMessage('assistant_delta', delta);
          }
          break;

        case 'message_end':
          // Extract final text from assistant messages
          if (event.message && event.message.role === 'assistant') {
            const content = event.message.content;
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

        default:
          // Handle synthetic error events
          if (/** @type {any} */ (event).type === '_genie_error') {
            yield makeError(
              'LLM call failed',
              /** @type {any} */(event).error,
            );
          }
          break;
      }
    }

    // Wait for prompt to fully complete
    await promptDone;

    // Run afterSend callback
    try {
      await afterSend(fullAssistantText);
    } catch (_err) {
      // afterSend errors are non-fatal
    }

    // Yield the final assembled assistant message
    if (fullAssistantText) {
      yield makeMessage('assistant', fullAssistantText);
    }
  }

  // Return agent interface
  return harden({
    chatRound,
  });
}

harden(makeAgent);
