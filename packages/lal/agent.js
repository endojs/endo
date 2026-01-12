// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

/** @import { FarRef } from '@endo/eventual-send' */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {object} GuestPowers
 * Local type definition for the Guest powers we use.
 * The actual EndoGuest type isn't exported from @endo/daemon.
 * @property {(methodName?: string) => Promise<string>} help
 * @property {(...petNamePath: string[]) => Promise<boolean>} has
 * @property {(...petNamePath: string[]) => Promise<string[]>} list
 * @property {(petNameOrPath: NameOrPath) => Promise<unknown>} lookup
 * @property {(...petNamePath: string[]) => Promise<void>} remove
 * @property {(fromPath: string[], toPath: string[]) => Promise<void>} move
 * @property {(fromPath: string[], toPath: string[]) => Promise<void>} copy
 * @property {(petNamePath: string[]) => Promise<unknown>} makeDirectory
 * @property {() => Promise<Array<{number: number, from: string, to: string, strings: string[], names: string[], ids: string[]}>>} listMessages
 * @property {(messageNumber: number, petNameOrPath: NameOrPath) => Promise<void>} resolve
 * @property {(messageNumber: number, reason?: string) => Promise<void>} reject
 * @property {(messageNumber: number, edgeName: NameOrPath, petName: NameOrPath) => Promise<void>} adopt
 * @property {(messageNumber: number) => Promise<void>} dismiss
 * @property {(recipientName: NameOrPath, description: string, responseName?: NameOrPath) => Promise<unknown>} request
 * @property {(recipientName: NameOrPath, strings: string[], edgeNames: string[], petNames: NameOrPath[]) => Promise<void>} send
 * @property {(...petNamePath: string[]) => Promise<string | undefined>} identify
 * @property {() => FarRef<AsyncGenerator<InboxMessage, undefined, undefined>>} followMessages
 */

/**
 * @typedef {string | string[]} NameOrPath
 * A pet name (string) or pet name path (array of strings).
 */

/**
 * @typedef {object} ToolParameterProperty
 * @property {string} [type]
 * @property {string} [description]
 * @property {{type: string}} [items]
 * @property {Array<{type: string, items?: {type: string}}>} [oneOf]
 */

/**
 * @typedef {object} ToolParameters
 * @property {'object'} type
 * @property {Record<string, ToolParameterProperty>} properties
 * @property {string[]} required
 */

/**
 * @typedef {object} ToolFunction
 * @property {string} name
 * @property {string} description
 * @property {ToolParameters} parameters
 */

/**
 * @typedef {object} Tool
 * @property {'function'} type
 * @property {ToolFunction} function
 */

/**
 * @typedef {object} ToolCall
 * @property {string} [id] - Tool call ID (required for Anthropic)
 * @property {object} function
 * @property {string} function.name
 * @property {Record<string, unknown> | string} function.arguments
 */

/**
 * @typedef {object} ChatMessage
 * @property {'system' | 'user' | 'assistant' | 'tool'} role
 * @property {string} content
 * @property {ToolCall[]} [tool_calls]
 * @property {string} [tool_call_id] - For tool role messages, the ID of the tool call being responded to
 */

/**
 * @typedef {object} ToolResult
 * @property {'tool'} role
 * @property {string} content
 * @property {string} [tool_call_id] - ID of the tool call being responded to
 */

/**
 * @typedef {object} ToolCallArgs
 * @property {string} [methodName]
 * @property {string[]} [petNamePath]
 * @property {NameOrPath} [petNameOrPath]
 * @property {string[]} [fromPath]
 * @property {string[]} [toPath]
 * @property {number} [messageNumber]
 * @property {string} [reason]
 * @property {NameOrPath} [edgeName]
 * @property {NameOrPath} [petName]
 * @property {NameOrPath} [recipientName]
 * @property {string} [description]
 * @property {NameOrPath} [responseName]
 * @property {string[]} [strings]
 * @property {string[]} [edgeNames]
 * @property {NameOrPath[]} [petNames]
 */

/**
 * @typedef {object} InboxMessage
 * @property {number} number
 * @property {string} from
 * @property {string} to
 * @property {string[]} strings
 * @property {string[]} names
 * @property {string[]} ids
 */

// ============================================================================
// Interface Definition
// ============================================================================

const LalInterface = M.interface('Lal', {
  help: M.call().optional(M.string()).returns(M.string()),
});

// ============================================================================
// Tool Definitions - Guest Powers
// ============================================================================

/** @type {Tool[]} */
const tools = [
  // --- Self-documentation ---
  {
    type: 'function',
    function: {
      name: 'help',
      description:
        'Get documentation for guest capabilities or a specific method. ' +
        'Call with no arguments for an overview, or with a method name for specific documentation.',
      parameters: {
        type: 'object',
        properties: {
          methodName: {
            type: 'string',
            description:
              'Optional method name to get specific documentation for.',
          },
        },
        required: [],
      },
    },
  },

  // --- Directory operations ---
  {
    type: 'function',
    function: {
      name: 'has',
      description:
        'Check if a pet name exists in the directory. Returns true or false.',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The pet name path to check, e.g., ["counter"] or ["subdir", "value"].',
          },
        },
        required: ['petNamePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list',
      description:
        'List all pet names in the directory or a subdirectory. Returns an array of names.',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional path to a subdirectory. Use [] for the root directory.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup',
      description:
        'Resolve a pet name or path to its value. Returns the value stored under that name.',
      parameters: {
        type: 'object',
        properties: {
          petNameOrPath: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'A pet name string like "counter" or a path array like ["subdir", "value"].',
          },
        },
        required: ['petNameOrPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove',
      description:
        'Remove a pet name from the directory. The underlying value is not deleted, just the name mapping.',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The pet name path to remove.',
          },
        },
        required: ['petNamePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move',
      description:
        'Move/rename a reference from one name to another. The original name is removed.',
      parameters: {
        type: 'object',
        properties: {
          fromPath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The source pet name path.',
          },
          toPath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The destination pet name path.',
          },
        },
        required: ['fromPath', 'toPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'copy',
      description:
        'Copy a reference to a new name. Both names will refer to the same value.',
      parameters: {
        type: 'object',
        properties: {
          fromPath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The source pet name path.',
          },
          toPath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The destination pet name path.',
          },
        },
        required: ['fromPath', 'toPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'makeDirectory',
      description: 'Create a new subdirectory at the given path.',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The path for the new directory.',
          },
        },
        required: ['petNamePath'],
      },
    },
  },

  // --- Mail operations ---
  {
    type: 'function',
    function: {
      name: 'listMessages',
      description:
        'List all messages in your inbox. Returns an array of message objects with number, date, from, type, and content.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve',
      description:
        'Respond to a request message by providing a named value. The requester receives the resolved value.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'number',
            description: 'The message number to respond to.',
          },
          petNameOrPath: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'The pet name of the value to send as the response.',
          },
        },
        required: ['messageNumber', 'petNameOrPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject',
      description: 'Decline a request message. The requester receives an error.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'number',
            description: 'The message number to decline.',
          },
          reason: {
            type: 'string',
            description: 'Optional reason for declining.',
          },
        },
        required: ['messageNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adopt',
      description:
        'Adopt a value from an incoming package message, giving it a pet name. ' +
        'Edge names are the labels the sender attached to values in the package.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'number',
            description: 'The message number containing the value.',
          },
          edgeName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'The edge name (label) of the value in the message.',
          },
          petName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'The pet name to give the adopted value.',
          },
        },
        required: ['messageNumber', 'edgeName', 'petName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dismiss',
      description:
        'Remove a message from your inbox. Use after you have processed a message.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'number',
            description: 'The message number to dismiss.',
          },
        },
        required: ['messageNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request',
      description:
        'Send a request to another agent asking for a capability. ' +
        'The recipient sees your request and can resolve or reject it.',
      parameters: {
        type: 'object',
        properties: {
          recipientName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'The pet name of the recipient, e.g., "HOST" for your host.',
          },
          description: {
            type: 'string',
            description: 'A description of what capability you are requesting.',
          },
          responseName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'Optional pet name to store the response under.',
          },
        },
        required: ['recipientName', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send',
      description: `\
Send a package message with values to another agent.

The message is constructed from alternating text strings and value references:
- strings: Array of text fragments
- edgeNames: Array of labels for the values being sent (one fewer than strings)
- petNames: Array of pet names providing the values (same length as edgeNames)

Example: To send "Here is [counter] for you" where counter is a value:
  send("HOST", ["Here is ", " for you"], ["counter"], ["my-counter"])

The recipient sees: "Here is @counter for you" and can adopt @counter.

IMPORTANT for code: When sending code, use a single string without edge names:
  send("HOST", ["Here is the code:\\n\`\`\`javascript\\nconst x = 1;\\n\`\`\`"], [], [])

For multi-line content, include literal newlines in the string.`,
      parameters: {
        type: 'object',
        properties: {
          recipientName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'The pet name of the recipient, e.g., "HOST" for your host.',
          },
          strings: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Text fragments. Length should be edgeNames.length + 1.',
          },
          edgeNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Labels for the values being sent.',
          },
          petNames: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
            },
            description:
              'Pet names of values to include (same length as edgeNames).',
          },
        },
        required: ['recipientName', 'strings', 'edgeNames', 'petNames'],
      },
    },
  },

  // --- Identity ---
  {
    type: 'function',
    function: {
      name: 'identify',
      description:
        'Get the formula ID for a pet name. Use identify("SELF") to get your own ID, ' +
        'which you can compare against the "from" field of messages to determine if you sent them.',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description: 'The pet name path to identify, e.g., ["SELF"] or ["HOST"].',
          },
        },
        required: ['petNamePath'],
      },
    },
  },

  // --- Capability inspection ---
  {
    type: 'function',
    function: {
      name: 'inspectCapability',
      description:
        'Look up a capability by pet name and call its help() method to learn how to use it. ' +
        'Use this to discover what methods a capability provides.',
      parameters: {
        type: 'object',
        properties: {
          petNameOrPath: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'The pet name or path of the capability to inspect.',
          },
        },
        required: ['petNameOrPath'],
      },
    },
  },
];

// ============================================================================
// System Prompt
// ============================================================================

/** @type {string} */
const systemPrompt = `\
You are an Endo agent with Guest capabilities in the Endo capability system.
You communicate entirely through tool calls - do not write prose responses.

## Your Environment

You exist in an object-capability (ocap) security environment where:
- You have a set of named references (pet names) to capabilities
- You can receive messages from other agents in your inbox
- You can send messages to other agents (especially HOST)
- You can request capabilities from your HOST
- Capabilities may implement a help() method for self-documentation

## Your Role

You respond to messages in your inbox using tool calls.
When you receive notification of new mail, you should:
1. Use listMessages() to see what messages you have
2. Process each message appropriately using the available tools
3. IMPORTANT: Always reply to the sender using send() - use the "from" field of the message as the recipient
4. IMPORTANT: Always dismiss() each message after you have satisfactorily handled it

You must reply to every message you receive. The sender is identified in the "from"
field of each message - use this as the recipient when calling send() to reply.

Messages remain in your inbox until dismissed. Dismissing a message signals that
you have completed processing it. Failing to dismiss leaves stale messages that
will appear in future listMessages() calls.

## Available Tools

### Self-documentation
- help(methodName?) - Get documentation for your capabilities

### Directory Operations (managing named references)
- list(petNamePath?) - List names in a directory
- has(petNamePath) - Check if a name exists
- lookup(petNameOrPath) - Get a value by name
- remove(petNamePath) - Remove a name
- move(fromPath, toPath) - Rename/move a reference
- copy(fromPath, toPath) - Copy a reference
- makeDirectory(petNamePath) - Create a subdirectory

### Mail Operations
- listMessages() - List inbox messages (includes BOTH sent and received messages)
- adopt(messageNumber, edgeName, petName) - Adopt a value from a message
- dismiss(messageNumber) - Remove a message from inbox
- request(recipientName, description, responseName?) - Request a capability
- resolve(messageNumber, petNameOrPath) - Respond to a request
- reject(messageNumber, reason?) - Decline a request
- send(recipientName, strings, edgeNames, petNames) - Send a message

### Identity
- identify(petNamePath) - Get the formula ID for a pet name (e.g., identify(["SELF"]) returns your ID)
- Compare message "from" field to your SELF ID to determine if you sent or received a message

### Capability Inspection
- inspectCapability(petNameOrPath) - Call help() on a capability to learn about it

## Message Format for send()

The send() tool constructs messages from alternating text and value references.

For plain text messages:
  send("HOST", ["Hello, I received your message."], [], [])

For messages with capability references:
  send("HOST", ["Here is ", " as requested."], ["result"], ["my-result"])
  // Recipient sees: "Here is @result as requested."
  // They can adopt @result to get the value named "my-result"

## Quasi-Markdown Formatting

Messages support a markdown dialect for rich text formatting:

### Block-level elements
- Headings: \`# Heading 1\` through \`###### Heading 6\`
- Code fences: \`\`\`language\\ncode\\n\`\`\`
- Unordered lists: \`- item\` or \`* item\`
- Ordered lists: \`1. item\` or \`1) item\`
- Paragraphs: Separated by blank lines

### Inline formatting (NOTE: differs from standard markdown!)
- Bold: \`*text*\` (single asterisks, NOT double)
- Italic: \`/text/\` (forward slashes, NOT asterisks)
- Underline: \`_text_\` (underscores)
- Strikethrough: \`~text~\` (tildes)
- Inline code: \`\\\`code\\\`\` (backticks)

### Examples
- Bold: \`*important*\` renders as **important**
- Italic: \`/emphasis/\` renders as _emphasis_
- Code: \`\\\`const x = 1\\\`\` renders as inline code

For multi-line code:
  send("HOST", ["Here is the implementation:\\n\`\`\`javascript\\nfunction add(a, b) {\\n  return a + b;\\n}\\n\`\`\`"], [], [])

## Special Pet Names

- SELF: Your own handle
- HOST: Your host agent (can grant you capabilities)
- AGENT: Your formula identifier

## Response Protocol

IMPORTANT: You must ONLY respond with tool calls. Do not include any text content.
When you need to communicate, use the send() tool to send messages.

Workflow for processing messages:
1. First, identify yourself: lookup("SELF") gives you a reference you can use with identify("SELF") to get your formula ID
2. Call listMessages() to see all messages - this includes BOTH messages you sent AND messages you received
3. For each message, check BOTH the "from" AND "to" fields:
   - If "from" matches your SELF ID: this is a message YOU sent (you can skip or dismiss it)
   - If "from" does NOT match your SELF ID: this is a message FROM someone else that you should process
4. For received messages:
   - Take appropriate action (adopt values, resolve/reject requests, etc.)
   - ALWAYS send a reply to the sender using the "from" field as recipient
   - Call dismiss(messageNumber) after handling
5. Proceed to the next message

IMPORTANT: The message list contains your own sent messages too! Always check if you are the
sender before trying to "reply" to a message - you don't want to reply to yourself.

You MUST reply to every message you RECEIVE (where "from" is not yourself).
Always dismiss messages after handling them - this is essential for proper operation.

## Error Handling

Tool calls may fail and return error results. When you receive an error:
1. Examine the error message to understand what went wrong
2. If appropriate, inform the sender about the error using send()
3. Decide whether to retry with different parameters or give up
4. Still dismiss the message after handling (even if handling failed)

Common errors include:
- Unknown pet name: The name doesn't exist in your directory
- Invalid arguments: Check parameter types and formats
- Permission denied: You may not have access to that capability

Always check tool results before proceeding - don't assume success.
`;

// ============================================================================
// Agent Implementation
// ============================================================================

/**
 * Creates a Lal agent that processes messages using an LLM.
 *
 * @param {FarRef<GuestPowers>} guestPowers - Guest powers from the Endo daemon
 * @returns {object} The Lal exo object
 */
export const make = (guestPowers, _contextP, { env }) => {
  console.log('[LAL]', env);
  // Cast to any for E() calls since TypeScript can't properly infer FarRef types
  /** @type {any} */
  const powers = guestPowers;

  // Configuration via environment variables:
  // LAL_HOST: Base URL for API
  //   - Ollama: http://localhost:11434/v1 (default)
  //   - OpenAI: https://api.openai.com/v1
  //   - Anthropic: https://api.anthropic.com (auto-detected)
  // LAL_MODEL: Model name
  //   - Ollama default: qwen3
  //   - Anthropic default: claude-opus-4-5-20251101
  //     https://www.anthropic.com/news/claude-opus-4-5
  //     https://openrouter.ai/anthropic/claude-opus-4.5
  // LAL_AUTH_TOKEN: API key (optional for local Ollama)

  const baseURL = env.LAL_HOST || 'http://localhost:11434/v1';
  const isAnthropic = baseURL.includes('anthropic.com');
  const defaultModel = isAnthropic ? 'claude-opus-4-5-20251101' : 'qwen3';
  const model = env.LAL_MODEL || defaultModel;

  /** @type {OpenAI | undefined} */
  let openai;
  /** @type {Anthropic | undefined} */
  let anthropic;

  if (isAnthropic) {
    anthropic = new Anthropic({
      apiKey: env.LAL_AUTH_TOKEN || '',
    });
    console.log(`[LAL] Using Anthropic with model: ${model}`);
  } else {
    openai = new OpenAI({
      apiKey: env.LAL_AUTH_TOKEN || 'ollama', // Ollama ignores API key but SDK requires one
      baseURL,
    });
    console.log(`[LAL] Using OpenAI-compatible API at ${baseURL} with model: ${model}`);
  }

  /**
   * Convert our tool format to Anthropic's format.
   * @param {Tool[]} openaiTools
   * @returns {Anthropic.Tool[]}
   */
  const toAnthropicTools = openaiTools =>
    openaiTools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: /** @type {Anthropic.Tool.InputSchema} */ (t.function.parameters),
    }));

  /**
   * Convert our messages to Anthropic's format.
   * @param {ChatMessage[]} messages
   * @returns {{system: string, messages: Anthropic.MessageParam[]}}
   */
  const toAnthropicMessages = messages => {
    let system = '';
    /** @type {Anthropic.MessageParam[]} */
    const anthropicMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else if (msg.role === 'user') {
        anthropicMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        /** @type {Anthropic.ContentBlockParam[]} */
        const content = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
            content.push({
              type: 'tool_use',
              id: tc.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: tc.function.name,
              input: args,
            });
          }
        }
        if (content.length > 0) {
          anthropicMessages.push({ role: 'assistant', content });
        }
      } else if (msg.role === 'tool') {
        // Use the tool_call_id stored in the message
        const toolUseId = msg.tool_call_id || 'unknown';
        anthropicMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: msg.content,
          }],
        });
      }
    }

    return { system, messages: anthropicMessages };
  };

  /**
   * Chat with the LLM.
   * @param {ChatMessage[]} messages
   * @returns {Promise<{message: ChatMessage}>}
   */
  const chat = async messages => {
    if (isAnthropic && anthropic) {
      const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
      console.log('[LAL] Calling Anthropic API...');
      console.log('[LAL] Messages:', JSON.stringify(anthropicMessages, null, 2));
      let response;
      try {
        response = await anthropic.messages.create({
          model,
          max_tokens: 4096,
          system,
          tools: toAnthropicTools(tools),
          messages: anthropicMessages,
        });
        console.log('[LAL] Anthropic response received');
      } catch (error) {
        console.error('[LAL] Anthropic API error:', error);
        throw error;
      }

      // Convert Anthropic response to our format
      /** @type {ChatMessage} */
      const message = { role: 'assistant', content: '' };
      /** @type {ToolCall[]} */
      const toolCalls = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          message.content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }

      return { message };
    } else if (openai) {
      const response = await openai.chat.completions.create({
        model,
        // @ts-ignore - Our tool format matches OpenAI's
        tools,
        // @ts-ignore
        messages,
      });
      const choice = response.choices[0];
      if (!choice) {
        return { message: { role: 'assistant', content: '' } };
      }
      // Convert OpenAI format to our internal format
      /** @type {ChatMessage} */
      const message = {
        role: 'assistant',
        content: choice.message.content || '',
      };
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        message.tool_calls = choice.message.tool_calls.map(tc => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }
      return { message };
    }
    throw new Error('No LLM provider configured');
  };

  /** @type {ChatMessage[]} */
  const transcript = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];

  /**
   * Execute a tool call and return the result.
   *
   * @param {string} name - Tool name
   * @param {ToolCallArgs} args - Tool arguments
   * @returns {Promise<unknown>} The result of the tool call
   */
  const executeTool = async (name, args) => {
    switch (name) {
      // Self-documentation
      case 'help': {
        const { methodName } = args;
        return E(powers).help(methodName);
      }

      // Directory operations
      case 'has': {
        const { petNamePath } = args;
        if (!petNamePath) {
          throw new Error('petNamePath is required');
        }
        return E(powers).has(...petNamePath);
      }
      case 'list': {
        const { petNamePath = [] } = args;
        return E(powers).list(...petNamePath);
      }
      case 'lookup': {
        const { petNameOrPath } = args;
        if (petNameOrPath === undefined) {
          throw new Error('petNameOrPath is required');
        }
        return E(powers).lookup(petNameOrPath);
      }
      case 'remove': {
        const { petNamePath } = args;
        if (!petNamePath) {
          throw new Error('petNamePath is required');
        }
        return E(powers).remove(...petNamePath);
      }
      case 'move': {
        const { fromPath, toPath } = args;
        if (!fromPath || !toPath) {
          throw new Error('fromPath and toPath are required');
        }
        return E(powers).move(fromPath, toPath);
      }
      case 'copy': {
        const { fromPath, toPath } = args;
        if (!fromPath || !toPath) {
          throw new Error('fromPath and toPath are required');
        }
        return E(powers).copy(fromPath, toPath);
      }
      case 'makeDirectory': {
        const { petNamePath } = args;
        if (!petNamePath) {
          throw new Error('petNamePath is required');
        }
        return E(powers).makeDirectory(petNamePath);
      }

      // Mail operations
      case 'listMessages': {
        return E(powers).listMessages();
      }
      case 'resolve': {
        const { messageNumber, petNameOrPath } = args;
        if (messageNumber === undefined || petNameOrPath === undefined) {
          throw new Error('messageNumber and petNameOrPath are required');
        }
        return E(powers).resolve(messageNumber, petNameOrPath);
      }
      case 'reject': {
        const { messageNumber, reason } = args;
        if (messageNumber === undefined) {
          throw new Error('messageNumber is required');
        }
        return E(powers).reject(messageNumber, reason);
      }
      case 'adopt': {
        const { messageNumber, edgeName, petName } = args;
        if (
          messageNumber === undefined ||
          edgeName === undefined ||
          petName === undefined
        ) {
          throw new Error('messageNumber, edgeName, and petName are required');
        }
        return E(powers).adopt(messageNumber, edgeName, petName);
      }
      case 'dismiss': {
        const { messageNumber } = args;
        if (messageNumber === undefined) {
          throw new Error('messageNumber is required');
        }
        return E(powers).dismiss(messageNumber);
      }
      case 'request': {
        const { recipientName, description, responseName } = args;
        if (recipientName === undefined || description === undefined) {
          throw new Error('recipientName and description are required');
        }
        return E(powers).request(recipientName, description, responseName);
      }
      case 'send': {
        const { recipientName, strings, edgeNames, petNames } = args;
        if (
          recipientName === undefined ||
          !strings ||
          !edgeNames ||
          !petNames
        ) {
          throw new Error(
            'recipientName, strings, edgeNames, and petNames are required',
          );
        }
        return E(powers).send(recipientName, strings, edgeNames, petNames);
      }

      // Identity
      case 'identify': {
        const { petNamePath } = args;
        if (!petNamePath) {
          throw new Error('petNamePath is required');
        }
        return E(powers).identify(...petNamePath);
      }

      // Capability inspection
      case 'inspectCapability': {
        const { petNameOrPath } = args;
        if (petNameOrPath === undefined) {
          throw new Error('petNameOrPath is required');
        }
        const capability = await E(powers).lookup(petNameOrPath);
        try {
          return await E(capability).help();
        } catch {
          return `Capability at "${petNameOrPath}" does not implement help().`;
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  /**
   * Process tool calls from the LLM response.
   *
   * @param {ToolCall[]} toolCalls - Array of tool calls from the LLM
   * @returns {Promise<ToolResult[]>} Array of tool results to feed back to the LLM
   */
  const processToolCalls = async toolCalls => {
    /** @type {ToolResult[]} */
    const results = [];

    for (const toolCall of toolCalls) {
      const { name, arguments: argsRaw } = toolCall.function;

      // Ollama returns arguments as an object or string depending on version
      /** @type {ToolCallArgs} */
      let args;
      if (typeof argsRaw === 'string') {
        try {
          args = JSON.parse(argsRaw);
        } catch {
          args = {};
        }
      } else {
        args = /** @type {ToolCallArgs} */ (argsRaw) || {};
      }

      console.log(`[tool] ${name}(${JSON.stringify(args)})`);

      /** @type {unknown} */
      let result;
      try {
        result = await executeTool(name, args);
        console.log(`[tool] ${name} -> ${JSON.stringify(result)}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result = { error: errorMessage };
        console.error(`[tool] ${name} error: ${errorMessage}`);
      }

      results.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });
    }

    return results;
  };

  /**
   * Run the agent loop, processing incoming messages.
   *
   * @returns {Promise<void>}
   */
  const runAgent = async () => {
    // Announce ourselves
    await E(powers).send('HOST', ['Lal agent ready.'], [], []);

    /** @type {string | undefined} */
    const selfId = await E(powers).identify('SELF');

    // Follow messages and notify the LLM
    for await (const message of makeRefIterator(E(powers).followMessages())) {
      const { from: fromId, number } =
        /** @type {InboxMessage} */ (message);

      // Skip our own messages
      if (fromId === selfId) {
        continue;
      }

      console.log(`[mail] New message #${number}`);

      // Notify the LLM that there's mail
      transcript.push({
        role: 'user',
        content:
          'You have new mail. Check your messages and respond appropriately.',
      });

      // Agentic loop: keep calling LLM until it stops producing tool calls
      let continueLoop = true;
      while (continueLoop) {
        console.log(`[lal] ${JSON.stringify(transcript[transcript.length-1], null, 2)}`);
        const response = await chat(transcript);

        const { message: responseMessage } = response;
        if (!responseMessage) {
          break;
        }

        // Add the assistant's response to the transcript
        transcript.push(/** @type {ChatMessage} */ (responseMessage));
        console.log(`[lal] sent: ${JSON.stringify(transcript[transcript.length-1], null, 2)}`);

        // Check if there are tool calls to process
        const { tool_calls: toolCalls } = responseMessage;
        if (toolCalls && toolCalls.length > 0) {
          const toolResults = await processToolCalls(
            /** @type {ToolCall[]} */ (toolCalls),
          );
          console.log(`[lal] tool results: ${JSON.stringify(toolResults, null, 2)}`);
          transcript.push(...toolResults);
        } else {
          // No more tool calls, exit the loop
          continueLoop = false;

          // If the LLM produced text content (which it shouldn't), log it
          if (responseMessage.content) {
            console.log(`[assistant] ${responseMessage.content}`);
          }
        }
      }
    }
  };

  // Start the agent loop
  runAgent().catch(error => {
    console.error('[agent] Fatal error:', error);
  });

  // Return the exo interface
  return makeExo('Lal', LalInterface, {
    /**
     * Get help documentation for the Lal agent.
     *
     * @param {string} [methodName] - Optional method name for specific documentation
     * @returns {string} Help text
     */
    help(methodName) {
      if (methodName === undefined) {
        return `\
Lal - An LLM agent with Endo Guest capabilities.

This agent processes messages from its inbox using tool calls to an LLM.
It can manage pet names, send/receive messages, and interact with capabilities.

The agent runs autonomously, responding to incoming mail.`;
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
