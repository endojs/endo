// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { passableAsJustin, makeMarshal } from '@endo/marshal';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { makeLocalTree } from '@endo/platform/fs/node';

import { createProvider } from './providers/index.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { GuestPowers, NameOrPath, ToolParameterProperty, ToolParameters, ToolFunction, Tool, ToolCall, ChatMessage, ToolResult, ToolCallArgs, InboxMessage, LalContext } from './agent.types' */

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
        'List contents of your directory or any capability you have a pet name for. ' +
        'With no arguments, lists pet names in your root directory. ' +
        'With a name, looks up that capability and calls list() on it ' +
        '(works on ReadableTree, WritableTree, directories, etc.).',
      parameters: {
        type: 'object',
        properties: {
          name: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'Optional pet name or path of a capability to list. ' +
              'Omit to list your own root directory.',
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
              'The pet name of the recipient, e.g., "@host" for your host.',
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
  send("@host", ["Here is ", " for you"], ["counter"], ["my-counter"])

The recipient sees: "Here is @counter for you" and can adopt @counter.

IMPORTANT for code: When sending code, use a single string without edge names:
  send("@host", ["Here is the code:\\n\`\`\`javascript\\nconst x = 1;\\n\`\`\`"], [], [])

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
              'The pet name of the recipient, e.g., "@host" for your host.',
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

  {
    type: 'function',
    function: {
      name: 'reply',
      description: `\
Reply to a message in your inbox, threading the response to the original message.
Use this instead of send() when responding to a received message.

The reply is automatically sent to the other party in the original conversation
and is threaded as a reply (the daemon sets replyTo on the outgoing message).

The message is constructed the same way as send():
- strings: Array of text fragments
- edgeNames: Array of labels for the values being sent
- petNames: Array of pet names providing the values

IMPORTANT: Always use reply() instead of send() when responding to a message.
Use send() only for initiating brand new conversations.`,
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'string',
            description:
              'The message number (BigInt) to reply to. Use SmallCaps format: "+5" for message 5.',
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
        required: ['messageNumber', 'strings', 'edgeNames', 'petNames'],
      },
    },
  },

  // --- Identity ---
  {
    type: 'function',
    function: {
      name: 'locate',
      description:
        'Get the locator URL for a pet name. Returns an "endo://..." URL string. ' +
        'Use locate(["@self"]) to get your own locator, then compare it against ' +
        'the "from" field of messages to determine if you sent them. ' +
        'Only pass pet names you know exist (use list() first if unsure).',
      parameters: {
        type: 'object',
        properties: {
          petNamePath: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The pet name path to locate, e.g., ["@self"] or ["@host"].',
          },
        },
        required: ['petNamePath'],
      },
    },
  },

  // --- Capability operations ---
  {
    type: 'function',
    function: {
      name: 'inspect',
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
  {
    type: 'function',
    function: {
      name: 'readText',
      description:
        'Read text content from a capability (ReadableTree, WritableTree, etc.). ' +
        'Looks up the capability by pet name and calls readText(fileName) on it.',
      parameters: {
        type: 'object',
        properties: {
          petNameOrPath: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'The pet name or path of the capability to read from.',
          },
          fileName: {
            type: 'string',
            description: 'The file name to read within the capability.',
          },
        },
        required: ['petNameOrPath', 'fileName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeText',
      description:
        'Write text content to a capability (WritableTree, etc.). ' +
        'Looks up the capability by pet name and calls writeText(fileName, content) on it.',
      parameters: {
        type: 'object',
        properties: {
          petNameOrPath: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description:
              'The pet name or path of the capability to write to.',
          },
          fileName: {
            type: 'string',
            description: 'The file name to write within the capability.',
          },
          content: {
            type: 'string',
            description: 'The text content to write.',
          },
        },
        required: ['petNameOrPath', 'fileName', 'content'],
      },
    },
  },

  // --- Code evaluation ---
  {
    type: 'function',
    function: {
      name: 'evaluate',
      description: `\
Evaluate JavaScript code directly.

The code executes immediately and returns the result. The result is stored under
the pet name you specify as resultName. You can then lookup(resultName) or send
it to the requester.

The code can reference values from your directory using the codeNames/edgeNames mapping:
- codeNames: Variable names that will be available in your source code
- edgeNames: Pet names of values from your directory to provide as those variables

Example: To run "E(counter).increment()" where counter is a value you have named "my-counter",
and store the result as "increment-result":
  evaluate(undefined, "E(counter).increment()", ["counter"], ["my-counter"], "increment-result")`,
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
              'Pet name (or path) where the evaluation result will be stored. You can then lookup and send the result.',
          },
        },
        required: ['source', 'codeNames', 'edgeNames', 'resultName'],
      },
    },
  },

  // --- Define (code with slots for host to fill) ---
  {
    type: 'function',
    function: {
      name: 'define',
      description: `\
Propose a reusable program with named capability slots for the host to fill.
Unlike evaluate(), you do NOT provide the capabilities yourself — the host
chooses what to bind from their own inventory. This is the preferred way to
request code execution when you don't have the required capabilities.

The host sees the code and slot labels, fills each slot with a capability
from their pet store, and the code is executed. The host can submit the
program multiple times with different bindings. You do not receive any
notification when the program is submitted — the result is private to the host.

Example: To request incrementing a counter you don't have:
  define("E(counter).increment()", {"counter": {"label": "A counter to increment"}})

The host will choose which counter to provide.`,
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'The JavaScript source code to evaluate.',
          },
          slots: {
            type: 'object',
            description:
              'Named capability slots. Keys are variable names in source, values are objects with a "label" string describing what capability is needed.',
            additionalProperties: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description:
                    'Human-readable description of what this slot needs.',
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['source', 'slots'],
      },
    },
  },
];

// ============================================================================
// System Prompt
// ============================================================================

/** @type {string} */
const systemPrompt = `\
You are an Endo agent with Guest capabilities. You communicate entirely
through tool calls — do not write prose responses.

## Quick Reference

1. \`listMessages()\` — Check your inbox
2. \`locate(["@self"])\` — Get your identity (compare with message "from" to identify your own messages)
3. For received messages: \`adopt()\` values -> process -> \`reply()\` -> \`dismiss()\`

## Names

There are two kinds of name in your inventory:

- *Special names* start with \`@\` and are read-only and indelible
  (you cannot remove, rename, or overwrite them):
  - \`@self\` — Your own handle
  - \`@host\` — Your host agent
- *Pet names* are user-chosen labels like \`my-counter\` or
  \`project-data\`. You can create, rename, copy, and remove them
  freely. They are lowercase alphanumeric with hyphens
  (\`a-z0-9-\`, 1-128 chars).

## SmallCaps

Message numbers are BigInt. Use \`"+N"\` format: \`dismiss("+5")\`, \`reply("+3", ...)\`

## Key Rules

1. Reply to every received message using \`reply()\`, then \`dismiss()\` it
2. Adopt values first — if a message has values in its \`names\` array, adopt them before use
3. Prefer direct tools — use \`list()\`, \`readText()\`, \`writeText()\`, \`lookup()\`, etc. instead of \`evaluate()\`
4. No prose responses — communicate only through tool calls
5. Check before acting — use \`list()\` and \`has()\` to verify pet names exist

## Helping the User

Your user may be interacting with Endo through either the *Endo CLI*
(terminal commands like \`endo ls\`, \`endo send\`, \`endo adopt\`) or the
*Endo Chat* web UI (slash commands like \`/ls\`, \`/send\`, \`/adopt\`),
or both. When giving the user instructions or guidance:

- Frame instructions for *both* interfaces when practical.
  For example: "You can list your inventory with \`endo ls\` in the
  terminal or \`/ls\` in Chat."
- Read \`readText("primer", "cli-reference.md")\` and
  \`readText("primer", "chat-reference.md")\` for the full command
  lists in each interface.
- Read the scenario guides under \`readText("primer", "howto-*.md")\`
  for step-by-step walkthroughs of common tasks.
- Prefer the user's apparent interface when you can infer it; if
  uncertain, show both.

## Primer

You have a \`primer\` directory in your inventory with detailed documentation.
Use the \`readText\` and \`list\` tools to read it:

\`\`\`
list("primer")          // See available docs
readText("primer", "README.md")   // Overview and table of contents
\`\`\`

The primer contains:
- Agent tool reference, messaging, capabilities, encoding, formatting, errors
- CLI and Chat command references
- How-to guides for common scenarios

When you encounter an unfamiliar situation, read the relevant primer document
before resorting to \`evaluate()\`. For unfamiliar capabilities, use
\`inspect("name")\` to call their \`help()\` method.
`;

// ============================================================================
// Agent Implementation
// ============================================================================

/**
 * Spawn a worker loop that follows a guest's inbox and processes messages
 * using the given LLM configuration.
 *
 * @param {any} powers - Guest powers (manager's own or a sub-guest's)
 * @param {Promise<object> | object | null | undefined} context - Context for cancellation
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string }} workerEnv - LLM provider config
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (powers, context, workerEnv) => {
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

  const provider = createProvider(workerEnv);

  /**
   * Chat with the LLM.
   * @param {ChatMessage[]} messages
   * @returns {Promise<{message: ChatMessage}>}
   */
  const chat = messages => provider.chat(messages, tools);

  // ---- Transcript Node Store ----
  // Each transcript is a linked chain of nodes. Each node stores only the
  // messages appended at that step, plus a pointer to the parent node.
  // The full transcript is assembled by walking the chain when calling the LLM.

  /** @import { TranscriptNode } from './agent.types' */

  /** @type {Map<string, TranscriptNode>} */
  const nodeCache = new Map();

  /**
   * Look up a transcript node, loading from durable storage if needed.
   * @param {string} messageId
   * @returns {Promise<TranscriptNode | undefined>}
   */
  const getNode = async messageId => {
    const cached = nodeCache.get(messageId);
    if (cached !== undefined) return cached;

    const petName = `transcript-${messageId}`;
    try {
      if (await E(powers).has(petName)) {
        const stored = /** @type {TranscriptNode} */ (
          await E(powers).lookup(petName)
        );
        // The stored node is hardened; make a mutable working copy.
        const mutable = { ...stored, messages: [...stored.messages] };
        nodeCache.set(messageId, mutable);
        return mutable;
      }
    } catch {
      // Storage lookup failed; treat as missing.
    }
    return undefined;
  };

  /**
   * Store a transcript node both in cache and durable storage.
   * @param {TranscriptNode} node
   */
  const putNode = async node => {
    nodeCache.set(node.messageId, node);
    const petName = `transcript-${node.messageId}`;
    try {
      // Harden a snapshot for storage; the working node stays mutable.
      await E(powers).storeValue(
        harden({ ...node, messages: [...node.messages] }),
        petName,
      );
    } catch (error) {
      console.error(
        `[transcript] Failed to persist node ${node.messageId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  /**
   * Assemble the full LLM transcript by walking the chain from leaf to root.
   * @param {string} leafMessageId
   * @returns {Promise<ChatMessage[]>}
   */
  const assembleTranscript = async leafMessageId => {
    /** @type {ChatMessage[][]} */
    const chain = [];
    /** @type {string | null} */
    let current = leafMessageId;
    while (current !== null) {
      const node = await getNode(current);
      if (node === undefined) break;
      chain.push(node.messages);
      current = node.parentMessageId;
    }
    chain.reverse();
    return chain.flat();
  };

  /**
   * Compute the conversational depth of a transcript (user + assistant turns).
   * @param {ChatMessage[]} messages
   * @returns {number}
   */
  const computeDepth = messages => {
    let count = 0;
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        count += 1;
      }
    }
    return count;
  };

  let nextRootId = 0;
  /**
   * Generate a unique string for use as a root node messageId.
   * These are only used as internal transcript-store keys, not as
   * cryptographic identifiers.
   * @returns {string}
   */
  const makeRootNodeId = () => {
    nextRootId += 1;
    return `root-${Date.now()}-${nextRootId}`;
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
   * The transcript node for the currently active agentic loop.
   * Set by runAgenticLoop before processing tool calls so that
   * the reply tool can compute and prepend transcript depth.
   * @type {TranscriptNode | null}
   */
  let activeLeafNode = null;

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
        const { name } = args;
        if (name !== undefined) {
          const capability = await E(powers).lookup(name);
          return E(capability).list();
        }
        return E(powers).list();
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
        const rawMessages = await E(powers).listMessages();
        return harden(
          rawMessages.map(
            (
              /** @type {InboxMessage & {messageId?: string, replyTo?: string}} */ msg,
            ) => ({
              number: msg.number,
              date: msg.date,
              from: msg.from,
              to: msg.to,
              type: msg.type,
              strings: msg.strings,
              names: msg.names,
              messageId: msg.messageId,
              replyTo: msg.replyTo,
            }),
          ),
        );
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
      case 'reply': {
        const { messageNumber, strings, edgeNames, petNames } = args;
        if (
          messageNumber === undefined ||
          !strings ||
          !edgeNames ||
          !petNames
        ) {
          throw new Error(
            'messageNumber, strings, edgeNames, and petNames are required',
          );
        }
        // Prepend transcript depth to the first string fragment
        let depthStrings = strings;
        if (activeLeafNode !== null) {
          const transcript = await assembleTranscript(activeLeafNode.messageId);
          const depth = computeDepth(transcript);
          if (depthStrings.length !== 0) {
            depthStrings = [
              `[depth:${depth}] ${depthStrings[0]}`,
              ...depthStrings.slice(1),
            ];
          } else {
            depthStrings = [`[depth:${depth}]`];
          }
        }
        return E(powers).reply(
          messageNumber,
          depthStrings,
          edgeNames,
          petNames,
        );
      }

      // Identity
      case 'locate': {
        const { petNamePath } = args;
        if (!petNamePath) {
          throw new Error('petNamePath is required');
        }
        return E(powers).locate(...petNamePath);
      }

      // Capability operations
      case 'inspect': {
        const { petNameOrPath } = args;
        if (petNameOrPath === undefined) {
          throw new Error('petNameOrPath is required');
        }
        const capability = await E(powers).lookup(petNameOrPath);
        const parts = [];
        try {
          const helpText = await E(capability).help();
          parts.push(helpText);
        } catch {
          parts.push(
            `Capability at "${petNameOrPath}" does not implement help().`,
          );
        }
        try {
          const methods = await E(capability).__getMethodNames__();
          parts.push(`\nMethods: ${methods.join(', ')}`);
        } catch {
          // No __getMethodNames__ available.
        }
        return parts.join('\n');
      }
      case 'readText': {
        const { petNameOrPath, fileName } = args;
        if (petNameOrPath === undefined || fileName === undefined) {
          throw new Error('petNameOrPath and fileName are required');
        }
        const capability = await E(powers).lookup(petNameOrPath);
        return E(capability).readText(fileName);
      }
      case 'writeText': {
        const { petNameOrPath, fileName, content } = args;
        if (
          petNameOrPath === undefined ||
          fileName === undefined ||
          content === undefined
        ) {
          throw new Error('petNameOrPath, fileName, and content are required');
        }
        const capability = await E(powers).lookup(petNameOrPath);
        return E(capability).writeText(fileName, content);
      }

      // Code evaluation
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

        // Execute code directly
        return E(powers).evaluate(
          workerName,
          source,
          harden(codeNames),
          harden(edgeNames),
          resultName,
        );
      }

      // Define code with slots for host to fill
      case 'define': {
        const { source, slots } = args;
        if (source === undefined) {
          throw new Error('source is required');
        }
        if (slots === undefined) {
          throw new Error('slots is required');
        }
        return E(powers).define(source, harden(slots));
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
   * Run the agentic loop for a specific transcript node.
   * @param {TranscriptNode} leafNode - The leaf node of the transcript chain
   * @returns {Promise<void>}
   */
  const runAgenticLoop = async leafNode => {
    activeLeafNode = leafNode;
    let continueLoop = true;
    while (continueLoop) {
      // Assemble the full transcript from the chain
      const transcript = await assembleTranscript(leafNode.messageId);

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

      // Add the assistant's response to the leaf node
      leafNode.messages.push(/** @type {ChatMessage} */ (responseMessage));
      console.log(
        `[lal] sent: ${JSON.stringify(leafNode.messages[leafNode.messages.length - 1], null, 2)}`,
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
        leafNode.messages.push(...toolResults);
        await putNode(leafNode);
        // After processing tools, loop again (notifications will be picked up
        // at the top of the next iteration by processNotifications).
      } else if (notificationQueue.length > 0) {
        // No tool calls, but there are notifications to process — loop again.
      } else if (pendingProposals.size > 0) {
        // Check if we have pending proposals - wait for them to settle
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
        // Loop again to process the notification.
      } else {
        // Really done
        continueLoop = false;
        await putNode(leafNode);
        activeLeafNode = null;

        // If the LLM produced text content (which it shouldn't), log it
        if (responseMessage.content) {
          console.log(`[assistant] ${responseMessage.content}`);
        }
      }
    }
  };

  /**
   * Build the user-role message content for an inbound message.
   * @param {InboxMessage & {type?: string}} message
   * @returns {string}
   */
  const formatInboundMessage = _message => {
    return 'You have new mail. Check your messages and respond appropriately.';
  };

  /**
   * Handle an own outbound message: create an alias so future replies
   * to this outbound messageId find the correct transcript chain.
   * @param {InboxMessage & {messageId?: string, replyTo?: string}} message
   */
  const handleOwnMessage = async message => {
    const { messageId, replyTo } = message;
    if (typeof messageId !== 'string' || typeof replyTo !== 'string') {
      return;
    }

    // replyTo points to the inbound message that triggered this response.
    // Create an alias: outboundMessageId → same node as replyTo.
    const node = await getNode(replyTo);
    if (node !== undefined) {
      nodeCache.set(messageId, node);
      const petName = `transcript-${messageId}`;
      try {
        await E(powers).storeValue(harden(node), petName);
      } catch (error) {
        console.error(
          `[transcript] Failed to alias ${messageId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  };

  /**
   * Run the agent loop, processing incoming messages.
   * Each reply chain is routed to an independent transcript.
   *
   * @returns {Promise<void>}
   */
  const runAgent = async () => {
    // Announce ourselves
    await E(powers).send('@host', ['Lal agent ready.'], [], []);

    /** @type {string | undefined} */
    const selfLocator = await E(powers).locate('@self');
    const cancelled = await getCancelled();
    const cancelledSignal = cancelled
      ? cancelled.then(
          () => ({ cancelled: true }),
          () => ({ cancelled: true }),
        )
      : null;

    // Follow messages and route each to the correct transcript chain
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
      const inboxMessage =
        /** @type {InboxMessage & {type?: string, messageId?: string, replyTo?: string}} */ (
          message
        );
      const {
        from: fromLocator,
        number,
        type,
        messageId,
        replyTo,
      } = inboxMessage;

      // Own outbound messages: index them for future reply lookups
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (fromLocator === selfLocator) {
        await handleOwnMessage(inboxMessage);
      } else {
        console.log(
          `[mail] New message #${number} (type: ${type || 'package'})`,
        );

        // Resolve or create the transcript chain for this message.
        /** @type {TranscriptNode | undefined} */
        let parentNode;
        /** @type {string} */
        let parentId;

        if (typeof replyTo === 'string') {
          parentNode = await getNode(replyTo);
        }

        if (parentNode !== undefined) {
          // Continue existing conversation.
          parentId = /** @type {string} */ (replyTo);
          console.log(
            `[transcript] Continuing chain from ${parentId.slice(0, 12)}...`,
          );
        } else {
          // New conversation — create a root node with the system prompt.
          const rootId = makeRootNodeId();
          /** @type {TranscriptNode} */
          const rootNode = {
            messageId: rootId,
            parentMessageId: null,
            messages: [{ role: 'system', content: systemPrompt }],
          };
          await putNode(rootNode);
          parentId = rootId;
          console.log('[transcript] Starting new conversation chain');
        }

        // Create a new node for this turn, chained to the parent.
        const userContent = formatInboundMessage(inboxMessage);

        /** @type {TranscriptNode} */
        const turnNode = {
          messageId:
            typeof messageId === 'string' ? messageId : makeRootNodeId(),
          parentMessageId: parentId,
          messages: [{ role: 'user', content: userContent }],
          lastInboxNumber: number,
        };
        await putNode(turnNode);

        // Run the agentic loop for this transcript chain
        try {
          await runAgenticLoop(turnNode);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[agent] LLM error, notifying sender:', errorMessage);
          try {
            await E(powers).reply(
              number,
              [`LLM provider error: ${errorMessage}`],
              [],
              [],
            );
          } catch (replyError) {
            console.error('[agent] Failed to notify sender:', replyError);
          }
        }

        const transcriptLength = (await assembleTranscript(turnNode.messageId))
          .length;
        console.log(
          `[lal] Transcript chain has ${transcriptLength} messages after processing`,
        );
      }
    }
  };

  // Start the worker loop
  await runAgent();
};
harden(spawnWorkerLoop);

// ============================================================================
// Manager / Entry Point
// ============================================================================

/**
 * Creates a Lal agent manager.
 *
 * Sends a configuration form to HOST on startup. Each form submission
 * creates a new guest profile and spawns a worker loop for it.
 *
 * @param {FarRef<GuestPowers>} guestPowers - Guest powers from the Endo daemon
 * @param {Promise<LalContext> | LalContext | undefined} _context - Context for cancellation support
 * @returns {object} The Lal exo object
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  // Send the configuration form to HOST for adding agents.
  const runManager = async () => {
    await E(powers).form(
      '@host',
      'Add an agent',
      harden([
        { name: 'name', label: 'Agent name' },
        {
          name: 'host',
          label: 'API host',
          default: 'http://localhost:11434/v1',
          example: 'https://api.anthropic.com for Anthropic',
        },
        {
          name: 'model',
          label: 'Model name',
          default: 'qwen3',
          example: 'claude-sonnet-4-6-20250514 for Anthropic',
        },
        {
          name: 'authToken',
          label: 'API auth token',
          default: 'ollama',
          example: 'sk-ant-... for Anthropic',
          secret: true,
        },
      ]),
    );

    // Resolve the host agent reference for provideGuest calls.
    const agent = await E(powers).lookup('host-agent');
    const selfLocator = await E(powers).locate('@self');
    const activeWorkers = new Map();

    // Check in the primer directory as a content-addressed readable-tree.
    // Stored once in the host namespace; each sub-guest gets a reference.
    const primerDirPath = new URL('./primer', import.meta.url).pathname;
    const localPrimerTree = makeLocalTree(primerDirPath);
    await E(agent).storeTree(localPrimerTree, 'lal-primer');
    const primerTreeId = await E(agent).identify('lal-primer');
    console.log(`[lal] Primer tree checked in (${primerTreeId})`);

    /**
     * Ensure the sub-guest has a `primer` reference.
     * @param {any} guest
     */
    const provisionPrimer = async guest => {
      const hasPrimer = await E(guest).has('primer');
      if (!hasPrimer) {
        await E(guest).storeIdentifier('primer', primerTreeId);
        console.log('[lal] Primer provisioned for guest');
      }
    };

    // Pre-scan existing messages to find our latest form messageId so that
    // old value messages (from prior sessions) that reply to an earlier form
    // are not accidentally matched when the iterator replays history.
    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (msg.from === selfLocator && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = makeRefIterator(E(powers).followMessages());
    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      const msg = /** @type {any} */ (message);

      // Capture the form's messageId from our own outbound message.
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (msg.from === selfLocator && msg.type === 'form') {
        formMessageId = msg.messageId;
      } else if (
        msg.type === 'value' &&
        // eslint-disable-next-line @endo/restrict-comparison-operands
        msg.replyTo === formMessageId
      ) {
        // Only process value messages that reply to our form.
        try {
          // Resolve the submitted values from the value message.
          const config =
            /** @type {{ name: string, host: string, model: string, authToken: string }} */ (
              await E(powers).lookupById(msg.valueId)
            );

          const { name } = config;

          if (activeWorkers.has(name)) {
            // A worker is already running for this name.
            await E(powers).reply(
              msg.number,
              [`Agent "${name}" already exists.`],
              [],
              [],
            );
          } else {
            // Create the guest profile via the host agent.
            // provideGuest returns the full EndoGuest (not the handle).
            // Guard with has() — on restart the guest already exists and
            // re-running provideGuest hits "Formula already exists".
            let guest;
            if (await E(agent).has(name)) {
              guest = await E(agent).lookup(name);
            } else {
              guest = await E(agent).provideGuest(name, {
                agentName: `profile-for-${name}`,
              });
            }

            // Ensure the sub-guest has the primer directory.
            await provisionPrimer(guest);

            // Spawn a worker loop for this guest.
            const workerP = spawnWorkerLoop(guest, null, {
              LAL_HOST: config.host,
              LAL_MODEL: config.model,
              LAL_AUTH_TOKEN: config.authToken,
            });
            activeWorkers.set(name, workerP);
            workerP.catch(error => {
              console.error(`[lal] Worker "${name}" error:`, error);
              activeWorkers.delete(name);
            });

            await E(powers).reply(
              msg.number,
              [`Agent "${name}" is now running.`],
              [],
              [],
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error('[lal] Form submission error:', errorMessage);
          try {
            await E(powers).reply(
              msg.number,
              [`Error creating agent: ${errorMessage}`],
              [],
              [],
            );
          } catch {
            // Best-effort reply.
          }
        }
      }
    }
  };

  runManager().catch(error => {
    console.error('[lal] Manager error:', error);
  });

  return makeExo('Lal', LalInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Lal agent manager. Submit the configuration form to add agents.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
