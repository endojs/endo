// @ts-check
/* global harden */
/* eslint-disable no-await-in-loop */

import { getToolSchemas, executeTool } from './tools.js';

/**
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} [content]
 * @property {Array<{ id?: string, function: { name: string, arguments: string|object }}>} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * @typedef {object} Provider
 * @property {(messages: ChatMessage[], tools: object[]) => Promise<{ message: ChatMessage }>} chat
 */

/**
 * @typedef {object} AgentCallbacks
 * @property {(name: string, args: Record<string, unknown>) => void} onToolCall
 * @property {(name: string, result: string) => void} onToolResult
 * @property {(name: string, error: string) => void} onToolError
 */

const MAX_ITERATIONS = 30;

/**
 * Extract tool calls embedded in assistant content as XML tags.
 * Some models embed tool calls as <tool_call>...</tool_call> in text content
 * rather than using the structured tool_calls field.
 *
 * @param {string} content
 * @returns {{ toolCalls: ChatMessage['tool_calls'], cleanedContent: string }}
 */
const extractToolCallsFromContent = content => {
  /** @type {NonNullable<ChatMessage['tool_calls']>} */
  const toolCalls = [];
  const toolCallRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  const matches = content.matchAll(toolCallRe);
  let index = 0;
  for (const match of matches) {
    const block = match[1].trim();
    let name = '';
    /** @type {string | object} */
    let args = '{}';
    try {
      const parsed = JSON.parse(block);
      if (parsed && typeof parsed === 'object') {
        name = parsed.name || '';
        if (parsed.arguments !== undefined) {
          args =
            typeof parsed.arguments === 'string'
              ? parsed.arguments
              : JSON.stringify(parsed.arguments);
        }
      }
    } catch {
      const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
      const argsMatch = block.match(/"arguments"\s*:\s*(\{[\s\S]*\})/);
      name = nameMatch ? nameMatch[1] : '';
      args = argsMatch ? argsMatch[1].trim() : '{}';
    }
    if (name) {
      toolCalls.push({
        id: `tool_${Date.now()}_${index}`,
        function: { name, arguments: args },
      });
      index += 1;
    }
  }

  let cleanedContent = content.replace(toolCallRe, '');
  cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '');
  cleanedContent = cleanedContent.trim();

  return { toolCalls: toolCalls.length > 0 ? toolCalls : undefined, cleanedContent };
};

/**
 * Run the agent loop for a single user turn.
 *
 * @param {string} userMessage - The user's message
 * @param {ChatMessage[]} transcript - Conversation transcript (mutated in place)
 * @param {Provider} provider - LLM provider
 * @param {import('@endo/eventual-send').ERef<object>} host - Endo host reference
 * @param {string} cwd - Working directory for filesystem tools
 * @param {AgentCallbacks} callbacks - UI callbacks
 * @returns {Promise<string>} The assistant's final text response
 */
export const runAgentLoop = async (
  userMessage,
  transcript,
  provider,
  host,
  cwd,
  callbacks,
) => {
  transcript.push({ role: 'user', content: userMessage });

  const toolSchemas = getToolSchemas();
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const response = await provider.chat(transcript, toolSchemas);
    const { message: responseMessage } = response;
    if (!responseMessage) {
      break;
    }

    // Handle models that embed tool calls in content text
    if (
      (!responseMessage.tool_calls ||
        responseMessage.tool_calls.length === 0) &&
      responseMessage.content
    ) {
      const extracted = extractToolCallsFromContent(responseMessage.content);
      if (extracted.toolCalls) {
        responseMessage.tool_calls = extracted.toolCalls;
        responseMessage.content = extracted.cleanedContent;
      }
    }

    transcript.push(responseMessage);

    const toolCalls = Array.isArray(responseMessage.tool_calls)
      ? responseMessage.tool_calls
      : [];

    if (toolCalls.length === 0) {
      return responseMessage.content || '';
    }

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function?.name ?? '';
      let parsedArgs;
      try {
        const rawArgs = toolCall.function?.arguments ?? '{}';
        parsedArgs =
          typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      } catch {
        parsedArgs = {};
      }

      callbacks.onToolCall(fnName, parsedArgs);

      let result;
      try {
        result = await executeTool(fnName, parsedArgs, host, cwd);
        callbacks.onToolResult(fnName, result);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : String(err);
        result = `Error: ${errMsg}`;
        callbacks.onToolError(fnName, errMsg);
      }

      transcript.push({
        role: 'tool',
        tool_call_id: toolCall.id || `tool_${Date.now()}`,
        content: result,
      });
    }

    iteration += 1;
  }

  return '(max iterations reached)';
};
harden(runAgentLoop);
