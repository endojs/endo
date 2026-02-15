// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { passableAsJustin, makeMarshal } from '@endo/marshal';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { createProvider } from './providers/index.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { GuestPowers, NameOrPath, ToolParameterProperty, ToolParameters, ToolFunction, Tool, ToolCall, ChatMessage, ToolResult, ToolCallArgs, InboxMessage, PendingProposal, ProposalNotification, LalContext, LalOptions } from './agent.types' */

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
            type: 'string',
            description:
              'The message number (BigInt). Use SmallCaps format: "+5" for message 5.',
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
      description:
        'Decline a request message. The requester receives an error.',
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'string',
            description:
              'The message number (BigInt). Use SmallCaps format: "+5" for message 5.',
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
            type: 'string',
            description:
              'The message number (BigInt). Use SmallCaps format: "+5" for message 5.',
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
            type: 'string',
            description:
              'The message number (BigInt). Use SmallCaps format: "+5" for message 5.',
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
            description:
              'The pet name path to identify, e.g., ["SELF"] or ["HOST"].',
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

  // --- Code evaluation proposal ---
  {
    type: 'function',
    function: {
      name: 'evaluate',
      description: `\
Propose code for evaluation to your HOST for approval.

IMPORTANT: This does NOT execute code directly. Instead, it sends an evaluation
proposal to your HOST. The HOST can then:
- Grant the proposal (execute the code)
- Reject the proposal
- Counter with a modified version

Use this when you need to run code that requires capabilities from your HOST.

You should ALWAYS specify resultName. The HOST stores the evaluation result under
this pet name in your directory when the proposal is granted. You can then
lookup(resultName) or send it to the requester. If you omit resultName, you only
get the result in the notification and have no stable name to reference or send.

The code can reference values from your directory using the codeNames/edgeNames mapping:
- codeNames: Variable names that will be available in your source code
- edgeNames: Pet names of values from your directory to provide as those variables

Example: To run "E(counter).increment()" where counter is a value you have named "my-counter",
and store the result as "increment-result":
  evaluate(undefined, "E(counter).increment()", ["counter"], ["my-counter"], "increment-result")

When the HOST grants the proposal, the result is stored at resultName and you will
receive a notification. Use lookup(resultName) to get the value and send() to deliver it.`,
      parameters: {
        type: 'object',
        properties: {
          workerName: {
            type: 'string',
            description:
              'Optional worker name to execute in. Use undefined for the default worker.',
          },
          source: {
            type: 'string',
            description: 'The JavaScript source code to evaluate.',
          },
          codeNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Variable names used in the source code that need to be provided.',
          },
          edgeNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Pet names from your directory providing the values for each codeName.',
          },
          resultName: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'Pet name (or path) where the HOST will store the evaluation result. You should always specify this so you can lookup and send the result after the proposal is granted.',
          },
        },
        required: ['source', 'codeNames', 'edgeNames', 'resultName'],
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

## Data Types (SmallCaps Encoding)

Tool arguments and results use SmallCaps encoding, which extends JSON with additional types.
Use these special string formats in your tool call arguments:

| Type       | SmallCaps Format    | Example                |
|------------|---------------------|------------------------|
| BigInt     | "+N" or "-N"        | "+123", "-456"         |
| undefined  | "#undefined"        | "#undefined"           |
| Infinity   | "#Infinity"         | "#Infinity"            |
| -Infinity  | "#-Infinity"        | "#-Infinity"           |
| NaN        | "#NaN"              | "#NaN"                 |

Examples:
- Message number (BigInt): \`{"messageNumber": "+5"}\`
- Checking for undefined: value === "#undefined"

For regular strings that start with special characters (!, #, $, %, &, +, -), prefix with !:
- String "!important" encodes as "!!important"
- String "+positive" encodes as "!+positive"

Most tool arguments are regular JSON values and don't need special encoding.

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

### Code Evaluation (Proposal)
- evaluate(workerName?, source, codeNames, edgeNames, resultName) - Propose code for HOST approval. resultName is required.

## Code Evaluation Proposals

When you need to run code that manipulates capabilities or performs computations,
use the evaluate() tool to propose code to your HOST for approval.

IMPORTANT: evaluate() does NOT run code directly. It sends a proposal to your HOST.
The HOST must explicitly grant the proposal before the code executes.

IMPORTANT: Always specify resultName. When the HOST grants the proposal, the result
is stored under this pet name in your directory. You can then lookup(resultName) and
send it to the requester. If you omit resultName, you only get the result in the
notification and have no stable name to reference or send.

Example: If you have a counter named "my-counter" and want to increment it, storing
the result as "increment-result":
  evaluate(undefined, "E(counter).increment()", ["counter"], ["my-counter"], "increment-result")

The codeNames array lists variable names used in your source code.
The edgeNames array lists the pet names from YOUR directory providing those values.
When the HOST grants, the code runs and you receive the result in your notification.

### Proposal Responses

After you submit an eval-proposal, you will be notified when the HOST responds:

**GRANTED**: The HOST executed your code.
- The result is stored at the resultName you specified (e.g. lookup(resultName) to get it)
- You will also receive the result value in the notification
- You should: Use lookup(resultName) to get the value, then send() to deliver it back to the original requester

**REJECTED**: The HOST declined your proposal.
- You will receive the rejection reason
- You should:
  1. Send a follow-up message to the sender explaining the situation
  2. Ask clarifying questions if the task is still relevant
  3. Consider alternative approaches

**COUNTER-PROPOSAL**: The HOST modified your code and sent it back.
- You will receive the modified code as an eval-proposal message
- Review the changes carefully
- You can:
  1. Accept by submitting a new evaluate() with the suggested code
  2. Reject if the changes don't meet your needs
  3. Send a message explaining why you disagree

### Globals Available in Evaluated Code

When your code executes (after HOST grants), these globals are available:

- **E(target)** - Eventual-send for remote method calls on capabilities
  Example: \`E(counter).increment()\` calls increment() on a remote counter
  Example: \`E(store).get("key")\` retrieves a value from a remote store

- **M** - Pattern matchers for interface guards
  Example: \`M.string()\` matches strings
  Example: \`M.interface('Foo', { bar: M.call().returns(M.number()) })\`

- **makeExo(tag, interface, methods)** - Create new capability objects
  Example:
  \`\`\`javascript
  makeExo('Counter', M.interface('Counter', {
    increment: M.call().returns(M.number()),
    getValue: M.call().returns(M.number()),
  }), {
    increment() { return ++this.state.count; },
    getValue() { return this.state.count; },
  })
  \`\`\`

Use these to:
- Invoke methods on capabilities passed as endowments
- Create new capabilities to send back to requesters
- Define type-safe interfaces for your created objects

### Responding to Proposal Status Changes

CRITICAL: You MUST respond to every proposal status notification you receive.
When you are notified that your proposal was granted, rejected, or counter-proposed,
you should IMMEDIATELY take follow-up action:

**On GRANTED**: Use send() to deliver results or report success to the original requester
**On REJECTED**: Use send() to explain the situation and ask clarifying questions
**On COUNTER-PROPOSAL**: Review and either accept, reject, or negotiate via send()

Never ignore a proposal status notification. The sender is waiting for your response.

### Workflow Example

1. Receive request: "Please increment my counter"
2. Propose: evaluate(undefined, "E(counter).increment()", ["counter"], ["user-counter"], "increment-result")
3. Wait for notification...
4. If GRANTED: The result is stored at "increment-result" - use lookup("increment-result") then send() to deliver it back to requester
5. If REJECTED: send() an apology/question to the requester
6. If COUNTER-PROPOSAL: review, then accept or negotiate

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
 * @param {Promise<LalContext> | LalContext | undefined} context - Context for cancellation support
 * @param {LalOptions} options - Configuration options
 * @param {import('./agent.types').LalEnv} options.env - Environment variables for LLM provider
 * @returns {object} The Lal exo object
 */
export const make = (guestPowers, context, { env }) => {
  console.log('[LAL]', env);
  // Cast to any for E() calls since TypeScript can't properly infer FarRef types
  /** @type {any} */
  const powers = guestPowers;
  const getCancelled = async () => {
    if (!context) return null;
    const resolvedContext = await context;
    if (!resolvedContext) return null;
    if (typeof resolvedContext.whenCancelled === 'function') {
      return E(resolvedContext).whenCancelled();
    }
    if (resolvedContext.cancelled) {
      return resolvedContext.cancelled;
    }
    return null;
  };

  // LAL_HOST, LAL_MODEL, LAL_AUTH_TOKEN; see providers/index.js.
  const provider = createProvider(env);

  /**
   * Chat with the LLM.
   * @param {ChatMessage[]} messages
   * @returns {Promise<{message: ChatMessage}>}
   */
  const chat = messages => provider.chat(messages, tools);

  /** @type {ChatMessage[]} */
  const transcript = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];

  // ---- Eval Proposal Tracking ----

  /** @type {Map<number, PendingProposal>} */
  const pendingProposals = new Map();
  let nextProposalId = 1;

  /** @type {ProposalNotification[]} */
  const notificationQueue = [];

  /**
   * Inject a notification about a proposal response into the transcript.
   * @param {ProposalNotification} notification
   */
  const injectProposalNotification = notification => {
    notificationQueue.push(notification);
  };

  // SmallCaps marshal for decoding LLM tool call arguments
  const { unserialize } = makeMarshal(undefined, undefined, {
    serializeBodyFormat: 'smallcaps',
  });

  /**
   * Decode SmallCaps JSON string to passable value.
   * @param {string} jsonString - Raw JSON string with SmallCaps encoding
   * @returns {unknown}
   */
  const decodeSmallcaps = jsonString =>
    unserialize({ body: `#${jsonString}`, slots: [] });

  /**
   * Extract tool calls embedded in assistant content.
   * @param {string} content
   * @returns {{ toolCalls: ToolCall[], cleanedContent: string }}
   */
  const extractToolCallsFromContent = content => {
    /** @type {ToolCall[]} */
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
        const argsMatch = block.match(/"arguments"\s*:\s*({[\s\S]*})/);
        name = nameMatch ? nameMatch[1] : '';
        args = argsMatch ? argsMatch[1].trim() : '{}';
      }
      if (name) {
        toolCalls.push({
          id: `tool_${Date.now()}_${index}`,
          function: {
            name,
            arguments: args,
          },
        });
        index += 1;
      }
    }

    let cleanedContent = content.replace(toolCallRe, '');
    cleanedContent = cleanedContent.replace(/<think>[\s\S]*?<\/think>/g, '');
    cleanedContent = cleanedContent.trim();

    return { toolCalls, cleanedContent };
  };

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

      // Code evaluation proposal
      case 'evaluate': {
        const {
          workerName: rawWorkerName,
          source,
          codeNames = [],
          edgeNames = [],
          resultName,
        } = args;
        if (source === undefined) {
          throw new Error('source is required');
        }
        if (resultName === undefined) {
          throw new Error('resultName is required');
        }
        // Convert "undefined" string to actual undefined
        const workerName =
          rawWorkerName === 'undefined' || rawWorkerName === '#undefined'
            ? undefined
            : rawWorkerName;

        // Send an eval-proposal to the HOST for approval
        const proposalPromise = E(powers).evaluate(
          workerName,
          source,
          harden(codeNames),
          harden(edgeNames),
          resultName,
        );

        // Track this proposal
        const proposalId = nextProposalId;
        nextProposalId += 1;

        pendingProposals.set(proposalId, {
          proposalId,
          source,
          codeNames,
          edgeNames,
          workerName,
          promise: proposalPromise,
        });

        // Watch for the proposal to settle
        proposalPromise.then(
          result => {
            console.log(
              `[proposal] #${proposalId} granted with result:`,
              result,
            );
            pendingProposals.delete(proposalId);
            injectProposalNotification({
              status: 'granted',
              proposalId,
              source,
              result,
            });
          },
          error => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.log(`[proposal] #${proposalId} rejected:`, errorMessage);
            pendingProposals.delete(proposalId);
            injectProposalNotification({
              status: 'rejected',
              proposalId,
              source,
              error: errorMessage,
            });
          },
        );

        // Return immediately - the LLM will be notified when the proposal settles
        return {
          proposalId,
          status: 'pending',
          message: `Proposal #${proposalId} sent to HOST for approval. You will be notified when the HOST responds.`,
          source,
        };
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

      // Decode SmallCaps arguments ("+7" -> 7n, "#undefined" -> undefined)
      /** @type {ToolCallArgs} */
      let args;
      try {
        const jsonString =
          typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
        args = /** @type {ToolCallArgs} */ (decodeSmallcaps(jsonString));
      } catch {
        args = {};
      }

      console.log(`[tool] ${name}(${passableAsJustin(harden(args), false)})`);

      /** @type {unknown} */
      let result;
      try {
        result = await executeTool(name, args);
        console.log(`[tool] ${name} -> ${passableAsJustin(result, false)}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result = harden({ error: errorMessage });
        console.error(`[tool] ${name} error: ${errorMessage}`);
      }

      results.push({
        role: 'tool',
        content: passableAsJustin(result, false),
        tool_call_id: toolCall.id,
      });
    }

    return results;
  };

  /**
   * Format a proposal notification as a user message for the LLM.
   * @param {ProposalNotification} notification
   * @returns {string}
   */
  const formatProposalNotification = notification => {
    const { status, proposalId, source } = notification;
    const sourceText = String(source);
    const sourcePreview =
      sourceText.length > 100 ? `${sourceText.slice(0, 100)}...` : sourceText;

    if (status === 'granted') {
      const resultStr =
        notification.result !== undefined
          ? `\nResult: ${passableAsJustin(notification.result, false)}`
          : '\nResult: (no return value)';
      return `Your eval-proposal #${proposalId} was GRANTED by the HOST.
Source: ${sourcePreview}${resultStr}

The code was executed successfully. If you specified a resultName, the result is now stored there.
You should:
1. If you have a capability to send back, use send() to deliver it to the original requester
2. If you were performing a task, report the outcome to the sender
3. Continue with any follow-up actions as needed`;
    } else {
      return `Your eval-proposal #${proposalId} was REJECTED by the HOST.
Source: ${sourcePreview}
Reason: ${notification.error || 'No reason given'}

The HOST declined to execute your proposed code. You should:
1. Send a follow-up message to the sender asking for clarification or explaining the situation
2. Consider whether a different approach might work
3. If appropriate, propose modified code that addresses the HOST's concerns`;
    }
  };

  /**
   * Process any pending notifications and add them to the transcript.
   * @returns {boolean} True if notifications were processed
   */
  const processNotifications = () => {
    if (notificationQueue.length === 0) {
      return false;
    }

    while (notificationQueue.length > 0) {
      const notification = notificationQueue.shift();
      if (notification) {
        const message = formatProposalNotification(notification);
        console.log(
          `[notification] Proposal #${notification.proposalId} ${notification.status}`,
        );
        transcript.push({
          role: 'user',
          content: message,
        });
      }
    }
    return true;
  };

  /**
   * Run the agentic loop until no more tool calls.
   * @returns {Promise<void>}
   */
  const runAgenticLoop = async () => {
    let continueLoop = true;
    while (continueLoop) {
      // Check for pending notifications before each LLM call
      processNotifications();

      console.log(
        `[lal] ${JSON.stringify(transcript[transcript.length - 1], null, 2)}`,
      );
      const response = await chat(transcript);

      const { message: responseMessage } = response;
      if (!responseMessage) {
        break;
      }

      if (
        (!responseMessage.tool_calls ||
          responseMessage.tool_calls.length === 0) &&
        responseMessage.content
      ) {
        const extracted = extractToolCallsFromContent(responseMessage.content);
        if (extracted.toolCalls.length > 0) {
          responseMessage.tool_calls = extracted.toolCalls;
          responseMessage.content = extracted.cleanedContent;
        }
      }

      // Add the assistant's response to the transcript
      transcript.push(/** @type {ChatMessage} */ (responseMessage));
      console.log(
        `[lal] sent: ${JSON.stringify(transcript[transcript.length - 1], null, 2)}`,
      );

      // Check if there are tool calls to process
      const toolCalls = Array.isArray(responseMessage.tool_calls)
        ? responseMessage.tool_calls
        : [];
      if (toolCalls.length !== 0) {
        const toolResults = await processToolCalls(
          /** @type {ToolCall[]} */ (toolCalls),
        );
        console.log(
          `[lal] tool results: ${JSON.stringify(toolResults, null, 2)}`,
        );
        transcript.push(...toolResults);

        // After processing tools, check if we have new notifications
        // This allows the loop to continue if proposals settled
        if (notificationQueue.length > 0) {
          continue;
        }
      } else {
        // No more tool calls - but check if we have notifications to process
        if (notificationQueue.length > 0) {
          continue;
        }

        // Check if we have pending proposals - wait for them to settle
        if (pendingProposals.size > 0) {
          console.log(
            `[lal] Waiting for ${pendingProposals.size} pending proposal(s) to settle...`,
          );
          // Wait for any pending proposal to settle
          const pendingPromises = [...pendingProposals.values()].map(p =>
            p.promise.then(
              () => {},
              () => {},
            ),
          );
          await Promise.race(pendingPromises);
          // Continue the loop to process the notification
          continue;
        }

        // Really done
        continueLoop = false;

        // If the LLM produced text content (which it shouldn't), log it
        if (responseMessage.content) {
          console.log(`[assistant] ${responseMessage.content}`);
        }
      }
    }
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
    const cancelled = await getCancelled();
    const cancelledSignal = cancelled
      ? cancelled.then(
          () => ({ cancelled: true }),
          () => ({ cancelled: true }),
        )
      : null;

    // Follow messages and notify the LLM
    const messageIterator = makeRefIterator(E(powers).followMessages());
    while (true) {
      const nextMessage = messageIterator.next();
      const raced = cancelledSignal
        ? await Promise.race([
            cancelledSignal,
            nextMessage.then(result => ({ cancelled: false, result })),
          ])
        : { cancelled: false, result: await nextMessage };
      if (raced.cancelled) {
        try {
          await messageIterator.return?.();
        } catch {
          // ignore iterator return errors on cancellation
        }
        break;
      }
      const { value: message, done } = raced.result;
      if (done) {
        break;
      }
      const {
        from: fromId,
        number,
        type,
      } = /** @type {InboxMessage & {type?: string}} */ (message);

      // Skip our own messages
      if (fromId === selfId) {
        continue;
      }

      console.log(`[mail] New message #${number} (type: ${type || 'package'})`);
      console.log(
        `[lal] Transcript has ${transcript.length} messages before processing`,
      );

      // Check if this is a counter-proposal (eval-proposal from someone else)
      if (
        type === 'eval-proposal-reviewer' ||
        type === 'eval-proposal-proposer'
      ) {
        // This is a counter-proposal from the HOST
        const { source, codeNames, edgeNames, workerName, resultName } =
          /** @type {any} */ (message);
        assert.typeof(source, 'string');
        const sourcePreview =
          source.length > 200 ? `${source.slice(0, 200)}...` : source;

        const endowmentsDesc =
          Array.isArray(codeNames) && codeNames.length > 0
            ? `\nEndowments: ${codeNames.map((/** @type {string} */ cn, /** @type {number} */ i) => `${cn} <- ${edgeNames?.[i] || '?'}`).join(', ')}`
            : '\nNo endowments';

        transcript.push({
          role: 'user',
          content: `You received a COUNTER-PROPOSAL from your HOST (message #${number}).

The HOST has modified your proposed code and is suggesting this alternative:

\`\`\`javascript
${sourcePreview}
\`\`\`
${endowmentsDesc}
${workerName ? `Worker: ${workerName}` : ''}
${resultName ? `Result will be stored as: ${resultName}` : ''}

You should:
1. Review the counter-proposal carefully
2. If it meets your needs, you can submit a new eval-proposal with the suggested code
3. If you disagree, you can reject this counter-proposal and explain why, or propose different code
4. After deciding, dismiss message #${number}`,
        });
      } else {
        // Regular message (package or request)
        transcript.push({
          role: 'user',
          content:
            'You have new mail. Check your messages and respond appropriately.',
        });
      }

      // Run the agentic loop
      try {
        await runAgenticLoop();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('[agent] LLM error, notifying sender:', errorMessage);
        // send() expects a pet name or path; inbox message "from" is a handle ID (e.g. hex).
        // Only send back when the sender is known by a valid name (e.g. HOST).
        const isValidName =
          typeof fromId === 'string' &&
          (/^[a-z][a-z0-9-]{0,127}$/.test(fromId) ||
            /^[A-Z][A-Z0-9-]{0,127}$/.test(fromId));
        if (isValidName) {
          await E(powers).send(fromId, [errorMessage], [], []);
        }
      }
      console.log(
        `[lal] Transcript has ${transcript.length} messages after processing`,
      );
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
