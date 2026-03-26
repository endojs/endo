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
/** @import { KnownProvider, Model, Provider } from '@mariozechner/pi-ai' */

import { Agent as PiAgent } from '@mariozechner/pi-agent-core';
import { getModel, getProviders } from '@mariozechner/pi-ai';

import {
  default as buildSystemPrompt,
} from '../system/index.js';


/**
 * @param {never} nope
 * @param {string} wat
 */
function inconeivable(nope, wat) {
  throw new Error(`inconceivable ${wat}: ${nope}`);
}

/**
 * Resolve a model argument into a pi-ai Model object.
 * For the "ollama" provider we construct a custom model object; for known
 * providers we look it up via getModel().
 *
 * @param {string | undefined} modelString
 * @returns {Promise<Model<'openai-completions'>>}
 */
async function resolveModel(modelString) {
  let provider = DEFAULT_PROVIDER;
  let modelId = DEFAULT_MODEL_ID;
  if (modelString) {
    modelId = modelString;
    const parts = modelString.split('/');
    if (parts.length >= 2) {
      provider = parts[0];
      modelId = parts.slice(1).join('/');
    }
  }

  if (provider === 'ollama') {
    return buildOllamaModel(modelId);
  }
  if (isKnownProvider(provider)) {
    // TODO fix type error:
    // > Argument of type 'string' is not assignable to parameter of type 'never'. typescript (2345)
    return getModel(provider, modelId);
  }
  throw new Error(
    `Unknown model: provider=${provider}, modelId=${modelId}. ` +
    `Pass a valid "provider/modelId" string (e.g. "${DEFAULT_MODEL_STRING}").`,
  );
}

/**
 * Resolve the API key for an Ollama model.
 *
 * Ollama itself does not require an API key, but the pi-ai openai-completions
 * provider rejects requests when no key is available.  We check
 * `OLLAMA_API_KEY` first (in case the user has set one for a remote Ollama
 * instance), then fall back to a harmless default so that local usage Just
 * Works™ without polluting `OPENAI_API_KEY`.
 *
 * @returns {string}
 */
function getOllamaApiKey() {
  return process.env.OLLAMA_API_KEY || 'ollama';
}
harden(getOllamaApiKey);

/**
 * Build a pi-ai–compatible Model object for a local Ollama model.
 * Ollama exposes an OpenAI-compatible /v1/chat/completions endpoint,
 * so we masquerade as the "openai" provider with a custom baseUrl.
 *
 * The API key is resolved via {@link getOllamaApiKey} and passed to
 * pi-agent-core through its `getApiKey` callback, avoiding mutation of
 * `process.env.OPENAI_API_KEY`.
 *
 * @param {string} id - The ollama model name (e.g. "glm-4.7-flash")
 * @returns {Promise<Model<'openai-completions'>>} A Model object compatible with pi-agent-core
 */
async function buildOllamaModel(id) {

  const api = 'openai-completions';

  // TODO discover this from ollama's model show endpoint
  const contextWindow = 32768;

  // TODO determine this based on a "reserved for response" proportion of the context window.
  const maxTokens = 8192;

  const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const baseUrl = `${ollamaHost}/v1`;

  // TODO detect this from model capabilities from show response
  const reasoning = false;

  // TODO detect image capability from show response
  /** @type {Array<'text'|'image'>} */
  const input = ['text'];

  return {
    id,
    name: `ollama/${id}`,
    api,
    // provider: 'ollama',
    provider: 'openai',
    baseUrl,
    reasoning,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
  };
}

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
 * @param {Error|null} [error=null] - Error if tool failed, null otherwise
 * @returns {ToolCallEnd}
 */
export function makeToolCallEnd(toolName, result, error = null) {
  return error
    ? harden({ type: 'ToolCallEnd', toolName, error })
    : harden({ type: 'ToolCallEnd', toolName, result });
}

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

/**
 * AgentThinking - Reasoning/thinking content from the model
 *
 * Emitted when the model produces chain-of-thought reasoning (e.g. Anthropic
 * extended thinking, OpenAI reasoning tokens).  The `role` distinguishes
 * between a complete thinking block (`'thinking'`) and an incremental
 * streaming delta (`'thinking_delta'`).
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

harden(makeToolCallStart);
harden(makeToolCallEnd);
harden(makeMessage);
harden(makeThinking);
harden(makeUserMessage);
harden(makeError);

/** @typedef {object} ToolSpec
 * @prop {string} name
 * @prop {string} summary
 */

/**
 * Default model provider and model ID.
 * Can be overridden by passing a model string in the format "provider/modelId"
 * or just "modelId" (defaults to 'ollama' provider).
 */

/** @type {Provider} */
const DEFAULT_PROVIDER = 'ollama'; // XXX 'openai' ?

const DEFAULT_MODEL_ID = 'llama3.2';

export const DEFAULT_MODEL_STRING = `${DEFAULT_PROVIDER}/${DEFAULT_MODEL_ID}`;

/**
 * @param {Provider} provider
 * @returns {provider is KnownProvider}
 */
function isKnownProvider(provider) {
  return getProviders().some(p => p == provider);
}

/** @param {any} val */
const mayJSONify = val => typeof val === 'string' ? val : JSON.stringify(val);

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
        content: [{ type: 'text', text: mayJSONify(result) }],
        details: result,
      };
      return toolResult;
    },
  };
}

/**
 * Create a PiAgent instance configured with the given options.
 *
 * This handles model resolution, system prompt construction, and tool
 * conversion — all the one-time setup that does not change per chat round.
 *
 * @param {object} options - Agent configuration
 * @param {string} [options.hostname] - Hostname for system prompt
 * @param {string} [options.currentTime] - Current time string
 * @param {string} [options.workspaceDir] - Workspace directory path
 * @param {string|Model<'openai-completions'>} [options.model] - Model identifier ("provider/modelId" or just "modelId")
 * @param {() => Array<ToolSpec>} [options.listTools] - List of available tools with name and execute function
 * @param {(name: string, args: any) => Promise<any>} [options.execTool] - Function to execute a tool by name
 * @param {boolean} [options.disableSuffix] - Disable security suffix
 * @param {boolean} [options.disablePolicy] - Disable policy section
 * @param {boolean} [options.strictPolicy] - Enable strict policy
 * @param {string} [options.securityNotes] - Custom security notes
 * @returns {Promise<PiAgent>}
 */
export async function makePiAgent(options = {}) {
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

  // Resolve the pi-ai Model object — either from a pre-constructed object
  // or by looking up the model string in the pi-ai registry.
  const resolvedModel = typeof model === 'object' ? model : await resolveModel(model);

  // Build the system prompt once at agent creation time.
  const systemPrompt = Array.from(buildSystemPrompt(systemPromptConfig)).join('\n');

  // Get tool list and convert to AgentTool format.
  const finalToolList = Array.from(listTools());
  const agentTools = finalToolList.map(spec => toAgentTool(spec, execTool));

  // When using an Ollama model, supply a getApiKey callback so that
  // pi-agent-core receives the key without us mutating OPENAI_API_KEY.
  const isOllama = resolvedModel.name?.startsWith('ollama/');

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt,
      model: resolvedModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: resolvedModel.reasoning ? 'medium' : 'off',
    },
    // Identity conversion - genie messages use standard roles
    convertToLlm: msgs => msgs.filter(m =>
      m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult',
    ),
    toolExecution: 'sequential',
    ...(isOllama ? { getApiKey: async (_provider) => getOllamaApiKey() } : {}),
  });

  return piAgent;
}
harden(makePiAgent);

/**
 * Run a single chat round on an already-constructed PiAgent, yielding
 * ChatEvent objects as they arrive.
 *
 * The caller is responsible for any pre/post-processing of the prompt
 * and final assistant text (the old beforeSend/afterSend hooks).
 *
 * @param {PiAgent} piAgent - A PiAgent instance from makePiAgent
 * @param {string} prompt - User prompt
 * @returns {AsyncGenerator<ChatEvent>}
 */
export async function* runAgentRound(piAgent, prompt) {
  // Collect events via subscription for progressive yielding
  let agentDone = false;
  /** @type {Array<AgentEvent|{type: 'error', error: any}>} */
  const eventQueue = [];

  /** @type {((value?: any) => void) | null} */
  let resolveWaiting = null;
  /** @param {boolean} done */
  const mayYield = (done) => {
    if (!agentDone) {
      agentDone = done;
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }
  };
  /** @returns {Promise<void>} */
  const forQueue = () => new Promise(resolve => {
    resolveWaiting = resolve;
  });

  piAgent.subscribe(event => {
    eventQueue.push(event);
    mayYield(false);
  });

  // Start the prompt (non-blocking)
  const promptDone = piAgent.prompt(prompt)
    .then(() => {
      eventQueue.push({ type: 'agent_start' });
      mayYield(false);
    })
    .catch(err => {
      eventQueue.push({ type: 'error', error: err });
      mayYield(true);
    });

  piAgent.waitForIdle()
    .then(() => {
      eventQueue.push({ type: 'agent_end', messages: [] });
      mayYield(true);
    })
    .catch(err => {
      eventQueue.push({ type: 'error', error: err });
      mayYield(true);
    });

  // Process events as they arrive, yielding Genie events
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
            event.toolName, null,
            event.isError ? new Error(`Tool execution failed: ${mayJSONify(event.result)}`) : null)
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
                    yield makeThinking('thinking', part.thinking, part.redacted);
                  }
                  break;
                }

                case 'toolCall': {
                  // TODO redundant with 'tool_execution_start'?
                  break;
                }

                default: {
                  inconeivable(part, 'pi agent message_start content part');
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
            inconeivable(message, 'pi agent message_start');
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

      case 'message_end': {
        const { message } = event;

        switch (message.role) {
          case 'assistant': {
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
          } break;

          case 'user': {
            const { content } = message;
            const userContent = typeof content === 'string'
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
          } break;
        }
      } break;

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

      default: inconeivable(event, 'pi agent event');
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
