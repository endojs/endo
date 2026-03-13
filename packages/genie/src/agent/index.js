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

    // TODO we need to also collect error feedback to pass to the LLM
    /** @type {Array<{error: string}|{toolName: string, result: any, error: any}>} */
    const results = [];

    // Process LLM response - extract and parse tool calls using generators

    const matches = Array.from(extractToolCalls(llmResponse, finalToolList));
    matches.sort((a, b) => a.start - b.start); // Sort by message order

    for (const match of matches) {
      if (!('toolName' in match)) {
        const { error } = match;
        const message = `Malformed tool call - ${error}`;
        results.push({ error: message });
        yield makeError(message, new Error(error));
        continue;
      }

      const parsed = parseToolCall(match, finalToolList);
      if ('error' in parsed) {
        const { pattern, error } = parsed;
        const message = `Invalid tool call: toolName:${pattern.toolName} - ${error}`;
        results.push({ error: message });
        yield makeError(message, new Error(error));
        continue;
      }

      // Emit start event
      yield makeToolCallStart(parsed.toolName, parsed.args);

      // Execute tool and collect result
      let result = null;
      let error = null;
      try {
        result = await execTool(parsed.toolName, parsed.args);
      } catch (err) {
        error = err;
      }
      results.push({ ...parsed, result, error });

      // Emit end event
      yield makeToolCallEnd(parsed.toolName, result, error);
    }

    // Feed tool results back to LLM
    let finalResponse = '';
    try {
      // TODO append tool call results to messages, otherwise the LLM cannot see them, and will not make progress

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
   * Extract tool call patterns from LLM response
   *
   * This generator scans the LLM response text for potential tool invocation patterns:
   * - ToolCallStart{...toolName...} style tool calls
   * - toolName({...}) style function calls
   *
   * Yields matches as they're found (streaming pattern detection).
   * This makes it possible to report tool calls as they're detected without
   * waiting for full parsing.
   *
   * The matches are yielded in order without validation.
   *
   * @typedef {{start: number, text: string}} ToolCallMatch
   * @typedef {ToolCallMatch & {toolName: string}} ToolCallPattern
   * @typedef {ToolCallMatch & {error: string}} MalformedToolCall
   *
   * @param {string} response - LLM response text to scan for tool calls
   * @param {Array<ToolSpec>} toolList - List of available tools to consider
   * @returns {Generator<ToolCallPattern|MalformedToolCall>}
   */
  function* extractToolCalls(response, toolList) {
    const toolNames = new Set(toolList.map(({ name }) => name));

    for (const toolName of toolNames) {
      // TODO we could extract all such `ToolCallStart`s separately from all `toolNames`, which would give us a chance to recognize invalid tool names (not just look for the ones we know), and also to detect malformed calls
      // Look for ToolCallStart{...toolName...} patterns
      const regex = new RegExp(`ToolCallStart\\{[^}]*${toolName}\\.?\\s*\\}`, 'g');
      let match;
      while ((match = regex.exec(response)) !== null) {
        yield {
          start: match.index,
          text: match[0],
          toolName,
        };
      }

      // Look for plain function call patterns: toolName({...})
      const execRegex = new RegExp(`${toolName}\\(\\s*\\{[^}]*\\}\\s*\\)`, 'g');
      while ((match = execRegex.exec(response)) !== null) {
        yield {
          start: match.index,
          text: match[0],
          toolName,
        };
      }
    }
  }

  /**
   * Parse tool calls from extracted patterns
   *
   * Takes a pattern matche from extractToolCalls and:
   * 1. Validates that the tool name exists in the registry
   * 2. Extracts and parses the argument object from within { } delimiters
   * 3. Falls back to heuristic parsing for malformed JSON
   * 4. Yields normalized tool calls along with invalid call information for handling
   *
   * @typedef {{toolName: string, args: any}} ToolCall
   * @typedef {{error: string, pattern: ToolCallPattern}} InvalidToolCall
   *
   * @param {ToolCallPattern} pattern
   * @param {Array<ToolSpec>} toolList - List of available tools
   * @returns {ToolCall|InvalidToolCall}
   */
  function parseToolCall(pattern, toolList) {
    const toolNames = new Set(toolList.map(({ name }) => name));

    // Skip if we don't have a tool name (shouldn't happen, but defensively handle it)
    if (!pattern.toolName) {
      return {
        error: `Missing toolName in ${pattern.text}`,
        pattern,
      };
    }

    // Validate tool name exists
    if (!toolNames.has(pattern.toolName)) {
      return {
        error: `Unknown tool: ${pattern.toolName}`,
        pattern,
      };
    }

    // Try to parse the JSON content inside { }
    try {
      const args = JSON.parse(pattern.text);
      // TODO args may need adapting form the ToolCallStart{"toolName":"name",...}
      return {
        toolName: pattern.toolName,
        args,
      };
    } catch (parseError) {
      // If JSON parsing fails, try to extract key-value pairs manually
      const cleanMatch = pattern.text
        .replace(/'([^']+)':\s*"([^"]*)"/g, (s, k, v) => {
          if (k === 'command') return `"${k}":"${v.toLowerCase().replace(/\n/g, ' ')}"`;
          return s;
        });
      try {
        const args = JSON.parse(cleanMatch);
        return {
          toolName: pattern.toolName,
          args,
        };
      } catch (_fixupParseError) {
        // Parsing failed after both direct and heuristic attempts
        return {
          error: `Failed to parse tool call args: ${parseError?.message}`,
          pattern,
        };
      }
    }
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
