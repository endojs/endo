/**
 * Genie Agent - Core agentic LLM calling harness
 *
 * This module implements an AI agent that handles:
 * - Session management
 * - Tool calls (bash, git, etc.)
 * - Memory integration
 * - Error handling and retry
 * - Streaming interface for tool execution
 */

import {
  default as buildSystemPrompt,
} from '../system/index.js';

/**
 * ToolCallStart - Event emitted when starting a tool call
 *
 * @param {string} toolName - Name of the tool being called
 * @param {Array<any>} args - Arguments passed to the tool
 */
function makeToolCallStart(toolName, args) {
  return { type: 'ToolCallStart', toolName, args };
}

/**
 * ToolCallEnd - Event emitted after a tool call completes
 *
 * @param {string} toolName - Name of the tool that was called
 * @param {any} result - Result of the tool call
 * @param {Error|null} [error=null] - Error if tool failed, null otherwise
 */
function makeToolCallEnd(toolName, result, error = null) {
  return { type: 'ToolCallEnd', toolName, result, error };
}

/**
 * Message - Standard text-based response from the agent
 *
 * @param {string} role - 'user', 'assistant', or 'tool'
 * @param {string} content - Message content
 */
function makeMessage(role, content) {
  return { type: 'Message', role, content };
}

/**
 * Error - Error event (for error handling in the stream)
 *
 * @param {string} message - Error message
 * @param {Error} cause - Underlying error
 */
function makeError(message, cause) {
  return { type: 'Error', message, cause };
}

/** @typedef {object} ToolSpec
 * @prop {string} name
 * @prop {string} summary
 */

/**
 * Create a Genie Agent instance
 *
 * @param {object} options - Agent configuration
 * @param {string} [options.hostname] - Hostname for system prompt
 * @param {string} [options.currentTime] - Current time string
 * @param {string} [options.workspaceDir] - Workspace directory path
 * @param {string} [options.model] - Model identifier
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
    execTool = (name, args) => new Error(`unimplemented tool ${name}`),
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

  // ============================================================================
  // AGENT INTERFACE
  // ============================================================================

  /**
   * Execute a single chat round
   *
   * This method handles:
   * 1. User prompt -> LLM
   * 2. Parse tool calls from LLM response
   * 3. Execute tool calls with streaming
   * 4. Feed tool results back to LLM
   * 5. Return final assistant response
   *
   * Returns an AsyncIterator that yields events:
   * - ToolCallStart: When starting a tool call
   * - ToolCallEnd: When a tool call completes
   * - Message: Assistant responses or user messages
   * - Error: Error events if something fails
   *
   * @param {object} input - Input parameters
   * @param {string} input.prompt - User prompt
   * @param {Array} [input.messages] - Previous message history (optional, for conversation)
   * @param {object} [input.tools] - Override tools for this call (optional)
   * @param {boolean} [input.disableMemory] - Disable memory integration (optional, default false)
   * @returns {AsyncIterator} AsyncIterator yielding events
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

    // Build messages array with system prompt
    const messagesArray = [
      {
        role: 'system',
        content: Array.from(buildSystemPrompt(systemPromptConfig)).join("\n")
      },
      ...messages,
      { role: 'user', content: prompt },
    ];

    // Get final tool list (overrides handled here)
    const finalToolList = Array.from(listTools());

    // Call LLM API (placeholder - will be implemented when LLM client is ready)
    let llmResponse = '';
    try {
      // LLM call with tools
      llmResponse = await callLLM(messagesArray, finalToolList);
    } catch (err) {
      yield makeError('LLM call failed', err);
      return;
    }

    // Process LLM response - extract and execute tool calls
    const toolCalls = parseToolCalls(llmResponse, finalToolList);
    const results = [];

    // Execute tool calls sequentially with streaming
    for (const toolCall of toolCalls) {
      // Emit start event
      yield makeToolCallStart(toolCall.toolName, toolCall.args);

      // Execute tool
      let result = null;
      let error = null;
      try {
        result = await execTool(toolCall.toolName, toolCall.args);
      } catch (err) {
        error = err;
      }

      // Emit end event
      yield makeToolCallEnd(toolCall.toolName, result, error);

      // Store result
      results.push({
        toolName: toolCall.toolName,
        args: toolCall.args,
        result,
        error,
      });
    }

    // Feed tool results back to LLM
    let finalResponse = '';
    try {
      // Note: Tool results would normally be added to messagesArray here.
      // But for this placeholder implementation, we'll just keep everything in one call.

      // Call LLM
      finalResponse = await callLLM(messagesArray, finalToolList);
    } catch (err) {
      yield makeError('LLM call failed', err);
      finalResponse = ''; // Fallback - but still yield messages
    }

    // Yield final assistant message
    yield makeMessage('assistant', finalResponse);
  }

  /**
   * Parse tool calls from LLM response
   *
   * Extracts tool invocation patterns like:
   * - ToolCallStart{...}
   * - toolName({...})
   *
   * @param {string} response - LLM response text
   * @param {Array<ToolSpec>} toolList - Available tools
   * @returns {Array<{toolName: string, args: any}>} Array of tool call objects
   */
  function parseToolCalls(response, toolList) {
    const toolNames = new Set(toolList.map(({ name }) => name));

    // TODO extract this loop out as a separate `function* extractToolCalls(response, toolNames)` generator
    // - the yielded type should be these pattern matches
    // - but at least start planning for how we can capture malformed tool calls alongside well-formed ones, using a type union to differentiate
    // Simple parsing: look for pattern
    // ToolCallStart{...} or toolName({...}) after context
    /** @type {Array<{name: string, start: number, text: string}>} */
    const patterns = [];
    for (const toolName of toolNames) {
      // Look for ToolCallStart{...} pattern
      const regex = new RegExp(`ToolCallStart\\{[^}]*${toolName}\\.?\\s*\\}`, 'g');
      let match;
      while ((match = regex.exec(response)) !== null) {
        patterns.push({ start: match.index, text: match[0], name: toolName });
      }

      // Look for executeTool call pattern
      const execRegex = new RegExp(`${toolName}\\(\\s*\\{[^}]*\\}\\s*\\)`, 'g');
      while ((match = execRegex.exec(response)) !== null) {
        patterns.push({ start: match.index, text: match[0], name: toolName });
      }
    }

    // Sort by position and extract
    patterns.sort((a, b) => a.start - b.start);

    // TODO refactor this to a generator function that yields `ToolCall | InvalidToolCall`
    // - ToolCall is the normalized `{toolName, args}` shape we've already got below
    // - InvalidToolCall will describe any parse errors, but should be generic enough to also be able to capture malformed pattern matches from `extractToolCalls` eventually
    /** @type {Array<{toolName: string, args: any}>} */
    const toolCalls = [];
    for (const pattern of patterns) {
      try {
        // Try to parse the JSON content inside { }
        let match = pattern.text.match(/\{([^}]*)\}/);
        if (!match) {
          continue;
        }

        /** @type {any} */
        let args = {};
        try {
          args = JSON.parse(match[1]);
        } catch (e) {
          // If JSON parsing fails, try to extract key-value pairs manually
          // Simple heuristic for common patterns
          const cleanMatch = match[1]
            .replace(/'([^']+)':\s*"([^"]*)"/g, (s, k, v) => {
              if (k === 'command') return `"${k}":"${v.toLowerCase().replace(/\n/g, ' ')}"`;
              return s;
            });
          args = JSON.parse(cleanMatch);
        }

        toolCalls.push({
          toolName: pattern.name,
          args,
        });
      } catch (e) {
        // Skip malformed patterns
        continue;
      }
    }
    return toolCalls;
  }

  /**
   * Call LLM API
   *
   * @param {Array} messages - Message array
   * @param {Array<ToolSpec>} tools - Available tools
   * @returns {Promise<string>} LLM response text
   */
  async function callLLM(messages, tools) {
    // Placeholder implementation
    // When LLM client is available, this would:
    // 1. Create/Get session
    // 2. Send messages with tools schema
    // 3. Stream response using session API
    // 4. Return assistant message content

    // For now, check if there's a model configured
    if (!model) {
      console.warn('[Agent] No model configured, returning placeholder response');
      return 'I am a placeholder agent. Configure a model to enable LLM responses.';
    }

    // For now, return a simple response indicating integration needed
    console.warn('[Agent] LLM integration not yet fully implemented. Using model:', model);
    return `I can help you with tasks using the ${model} model. Full LLM integration coming soon.`;
  }

  // Return agent interface
  return {
    chatRound,
  };
}
