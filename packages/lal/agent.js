// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { makeExo } from '@endo/exo';
import { M, mustMatch } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { passableAsJustin, makeMarshal } from '@endo/marshal';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { NamePathShape, NameOrPathShape } from '@endo/daemon/type-guards.js';
import { makeLocalTree } from '@endo/platform/fs/node';

import { Agent as PiAgent } from '@earendil-works/pi-agent-core';
import { registerBuiltInApiProviders, getModel } from '@earendil-works/pi-ai';
import { runAgentRound } from './agent-round.js';

import { systemPrompt } from './prompts/system.js';

/** @import { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core' */
/** @import { Model } from '@earendil-works/pi-ai' */

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { GuestPowers, ToolCallArgs, InboxMessage, LalContext } from './agent.types.js' */

// Register pi-ai's built-in API providers (anthropic, openai, google,
// openrouter, mistral, deepseek, groq, xai, github-copilot, and ~20 others)
// so getModel(provider, modelId) lookups succeed for any caller-supplied
// "provider/modelId" string. Ollama is *not* in this registry; lal handles
// "ollama/<id>" specially in `resolveWorkerModel` below by constructing a
// custom Model that points at a local OpenAI-compatible Ollama endpoint.
registerBuiltInApiProviders();

// ============================================================================
// Interface Definition
// ============================================================================

const LalInterface = M.interface('Lal', {
  help: M.call().optional(M.string()).returns(M.string()),
});

// ============================================================================
// Endo Capability Tool Specs
// ============================================================================
//
// Each tool is named, has a one-line summary (used by pi-agent-core as the
// tool description sent to the LLM), and an `execute(powers, args)` callback
// that calls into the daemon. The `parameters` field captures the JSON-schema
// shape the LLM should target; `toAgentTool` (defined below) wraps each spec
// in the permissive open-object schema pi-agent-core ships today. When
// `pi-agent-core` learns to forward custom parameter schemas this field will
// be wired through directly.
//
// Tool dispatch lives entirely in this module: `executeTool` is the single
// `switch` that maps tool names to `E(powers)` calls. The set of tools is the
// same surface lal exposed before the genie migration; only the agent loop
// driving them has been replaced.

/**
 * @typedef {object} LalToolDef
 * @property {string} name
 * @property {string} summary - one-line description sent to the LLM.
 * @property {object} [parameters] - JSON-schema-like shape (for documentation).
 * @property {Pattern} [params] - `@endo/patterns`
 *   matcher run against the decoded args object before dispatch. Inspired by
 *   `packages/genie/src/tools/common.js`, which uses the same matcher
 *   discipline to validate tool inputs at the `@endo/patterns` layer that
 *   the rest of the Endo capability surface already speaks.
 */

// Pet-name and path matchers are imported from `@endo/daemon/type-guards.js`
// so lal validates inbound pet-name arguments against the same shapes the
// daemon's own interfaces use.
// Message numbers are BigInts. The rigorous SmallCaps decode (`decodeToolArgs`
// below) always produces a BigInt for `"+N"`/`"-N"` inputs; plain numbers are
// also accepted for ergonomic LLM emission of small integers.
const MessageNumberShape = M.or(M.bigint(), M.number());

/** @type {LalToolDef[]} */
export const toolDefs = [
  // --- Self-documentation ---
  {
    name: 'help',
    summary:
      'Get documentation for guest capabilities or a specific method. ' +
      'Call with no arguments for an overview, or with a method name for specific documentation.',
    params: M.splitRecord({}, { methodName: M.string() }),
  },

  // --- Directory operations ---
  {
    name: 'has',
    summary:
      'Check if a pet name exists in the directory. Returns true or false. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },
  {
    name: 'list',
    summary:
      'List contents of your directory or any capability you have a pet name for. ' +
      'With no arguments, lists pet names in your root directory. ' +
      'With a name, looks up that capability and calls list() on it. ' +
      'Optional argument: name (string or string[]).',
    params: M.splitRecord({}, { name: NameOrPathShape }),
  },
  {
    name: 'lookup',
    summary:
      'Resolve a pet name or path to its value. Returns the value stored under that name. ' +
      'Argument: petNameOrPath (string or string[]).',
    params: M.splitRecord({ petNameOrPath: NameOrPathShape }),
  },
  {
    name: 'remove',
    summary:
      'Remove a pet name from the directory. The underlying value is not deleted, just the name mapping. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },
  {
    name: 'move',
    summary:
      'Move/rename a reference from one name to another. The original name is removed. ' +
      'Arguments: fromPath (string[]), toPath (string[]).',
    params: M.splitRecord({ fromPath: NamePathShape, toPath: NamePathShape }),
  },
  {
    name: 'copy',
    summary:
      'Copy a reference to a new name. Both names will refer to the same value. ' +
      'Arguments: fromPath (string[]), toPath (string[]).',
    params: M.splitRecord({ fromPath: NamePathShape, toPath: NamePathShape }),
  },
  {
    name: 'makeDirectory',
    summary:
      'Create a new subdirectory at the given path. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },

  // --- Mail operations ---
  {
    name: 'listMessages',
    summary:
      'List all messages in your inbox. Returns an array of message objects ' +
      'with number, date, from, type, and content. No arguments.',
    params: M.splitRecord({}),
  },
  {
    name: 'resolve',
    summary:
      'Respond to a request message by providing a named value. ' +
      'Arguments: messageNumber (BigInt encoded as "+N", e.g. "+5"), petNameOrPath.',
    params: M.splitRecord({
      messageNumber: MessageNumberShape,
      petNameOrPath: NameOrPathShape,
    }),
  },
  {
    name: 'reject',
    summary:
      'Decline a request message. The requester receives an error. ' +
      'Arguments: messageNumber (BigInt encoded as "+N", e.g. "+5"), optional reason (string).',
    params: M.splitRecord(
      { messageNumber: MessageNumberShape },
      { reason: M.string() },
    ),
  },
  {
    name: 'adopt',
    summary:
      'Adopt a value from an incoming package message, giving it a pet name. ' +
      'Arguments: messageNumber (BigInt encoded as "+N", e.g. "+5"), edgeName, petName.',
    params: M.splitRecord({
      messageNumber: MessageNumberShape,
      edgeName: NameOrPathShape,
      petName: NameOrPathShape,
    }),
  },
  {
    name: 'dismiss',
    summary:
      'Remove a message from your inbox. Use after you have processed a message. ' +
      'Argument: messageNumber (BigInt encoded as "+N", e.g. "+5").',
    params: M.splitRecord({ messageNumber: MessageNumberShape }),
  },
  {
    name: 'request',
    summary:
      'Send a request to another agent asking for a capability. ' +
      'Arguments: recipientName, description (string), optional responseName.',
    params: M.splitRecord(
      { recipientName: NameOrPathShape, description: M.string() },
      { responseName: NameOrPathShape },
    ),
  },
  {
    name: 'send',
    summary:
      'Send a package message with values to another agent. ' +
      'Arguments: recipientName, strings (string[]), edgeNames (string[]), petNames. ' +
      'For text-only messages: send("@host", ["text"], [], []).',
    params: M.splitRecord({
      recipientName: NameOrPathShape,
      strings: M.arrayOf(M.string()),
      edgeNames: M.arrayOf(M.string()),
      petNames: M.arrayOf(NameOrPathShape),
    }),
  },
  {
    name: 'reply',
    summary:
      'Reply to a message in your inbox, threading the response to the original message. ' +
      'Use this instead of send() when responding to a received message. ' +
      'Arguments: messageNumber (BigInt encoded as "+N", e.g. "+3"), strings (string[]), edgeNames (string[]), petNames.',
    params: M.splitRecord({
      messageNumber: MessageNumberShape,
      strings: M.arrayOf(M.string()),
      edgeNames: M.arrayOf(M.string()),
      petNames: M.arrayOf(NameOrPathShape),
    }),
  },

  {
    type: 'function',
    function: {
      name: 'editMessage',
      description: `\
Replace the interior of a message you previously sent.

Use to correct a prior reply, settle a "Thinking..." placeholder into a
final answer, or amend a settled message. Only the original sender may
edit. The message keeps its number and reply-linkage; the prior revision
is preserved in messageHistory.

Pairs with the daemon editMessage capability.
Pass done: false to mark a partial submission (recipient should show a
progress indicator); pass done: true (or omit) once the message has
settled.`,
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'string',
            description:
              'The outbound message number (BigInt) to edit. Use SmallCaps format: "+5" for message 5.',
          },
          strings: {
            type: 'array',
            items: { type: 'string' },
            description:
              'New text fragments. Length should be edgeNames.length + 1.',
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
          done: {
            type: 'boolean',
            description:
              'Defaults to true. Pass false to mark this revision as a partial submission.',
          },
        },
        required: ['messageNumber', 'strings', 'edgeNames', 'petNames'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'messageHistory',
      description: `\
Return the ordered revision history of a message in your inbox or
outbox.  Useful when an inbound message was edited after you began
work and you need to know what the earlier text said.  Returns an
array of revisions, oldest first; the last entry is the current
message.

Pairs with the daemon messageHistory capability.`,
      parameters: {
        type: 'object',
        properties: {
          messageNumber: {
            type: 'string',
            description:
              'The message number (BigInt) to inspect. Use SmallCaps format: "+5" for message 5.',
          },
        },
        required: ['messageNumber'],
      },
    },
  },

  // --- Identity ---
  {
    name: 'locate',
    summary:
      'Get the locator URL for a pet name. Returns an "endo://..." URL string. ' +
      'Use locate(["@self"]) to get your own locator. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },

  // --- Capability operations ---
  {
    name: 'inspect',
    summary:
      'Look up a capability by pet name and call its help() method to learn how to use it. ' +
      'Argument: petNameOrPath.',
    params: M.splitRecord({ petNameOrPath: NameOrPathShape }),
  },
  {
    name: 'readText',
    summary:
      'Read text content from a capability (ReadableTree, WritableTree, etc.). ' +
      'Arguments: petNameOrPath, fileName (string).',
    params: M.splitRecord({
      petNameOrPath: NameOrPathShape,
      fileName: M.string(),
    }),
  },
  {
    name: 'writeText',
    summary:
      'Write text content to a capability (WritableTree, etc.). ' +
      'Arguments: petNameOrPath, fileName (string), content (string).',
    params: M.splitRecord({
      petNameOrPath: NameOrPathShape,
      fileName: M.string(),
      content: M.string(),
    }),
  },

  // --- Code evaluation ---
  {
    name: 'evaluate',
    summary:
      'Evaluate JavaScript code directly. Arguments: workerName (string|undefined), ' +
      'source (string), codeNames (string[]), edgeNames (string[]), resultName.',
    // workerName + codeNames + edgeNames are optional in the dispatcher
    // (codeNames/edgeNames default to [] and workerName accepts the
    // "#undefined" SmallCaps sentinel). Allow either undefined or the
    // expected primitive shape.
    params: M.splitRecord(
      { source: M.string(), resultName: NameOrPathShape },
      {
        workerName: M.or(M.string(), M.undefined()),
        codeNames: M.arrayOf(M.string()),
        edgeNames: M.arrayOf(M.string()),
      },
    ),
  },

  // --- Define (code with slots for host to fill) ---
  {
    name: 'define',
    summary:
      'Propose a reusable program with named capability slots for the host to fill. ' +
      'Unlike evaluate(), you do NOT provide the capabilities yourself. ' +
      'Arguments: source (string), slots (object mapping slot name to { label }).',
    params: M.splitRecord({
      source: M.string(),
      slots: M.recordOf(M.string(), M.splitRecord({ label: M.string() })),
    }),
  },
];

// ============================================================================
// Tool Dispatch
// ============================================================================

// Rigorous SmallCaps encode/decode for tool-call args. The wire format is
// JSON all the way through Pi,
// but all arg values and tool results are interpreted as SmallCaps: BigInts
// arrive as `"+N"` / `"-N"`, strings that begin with a special-prefix char
// (the BANG-to-DASH range `!"#$%&'()*+,-`) are `!`-prefixed by the LLM,
// and the decoder reverses both transformations rigorously. The LLM is
// taught the full SmallCaps grammar in the system prompt below so it can
// produce correct encodings; the patterns matchers then validate the
// decoded passables rather than the raw JSON strings.
//
// The codec is constructed once at module load. No slot converters are
// needed because tool args never carry remotables or promises; the defaults
// (`dontEncodeRemotableToSmallcaps` / `dontEncodePromiseToSmallcaps`) are
// the right handlers and will throw if a remotable somehow reaches the
// boundary.

/** @type {ReturnType<typeof makeMarshal>} */
const smallcapsMarshal = makeMarshal(undefined, undefined, {
  serializeBodyFormat: 'smallcaps',
  // Tool-result encoding only; error logging is irrelevant here.
  marshalSaveError: () => {},
});

// Pre-index each tool's @endo/patterns matcher by tool name. The matcher
// validates the SmallCaps-decoded args record before dispatch, matching the
// discipline `packages/genie/src/tools/common.js` applies (per-tool schema
// + nested-JSON fixup) but expressed at the args-record level since lal's
// tools share one switch-dispatcher rather than per-tool closures.
const paramsByTool = new Map(
  toolDefs.filter(t => t.params !== undefined).map(t => [t.name, t.params]),
);

/**
 * Decode inbound tool args from their SmallCaps JSON representation and
 * validate them against the tool's `@endo/patterns` matcher.
 *
 * Pi delivers tool args as an already-JSON-parsed plain object. We treat
 * each value as a SmallCaps encoding: `"+N"` / `"-N"` become BigInts,
 * `"!<s>"` becomes the literal string `<s>` (Hilbert-hotel escape for
 * strings whose first character is a SmallCaps special prefix), `"#undefined"`
 * becomes `undefined`, and all other values pass through unchanged. The
 * round-trip is performed by reconstructing the SmallCaps body from the
 * JSON-parsed args and calling `fromCapData`.
 *
 * After SmallCaps decoding, if the first `mustMatch` attempt fails and any
 * top-level string field parses as JSON (a fallback for smaller LLMs that
 * still emit nested arrays/objects as quoted JSON strings), we retry once
 * with those fields un-JSON-fied. This preserves the resilience that
 * `validateAndFixupArgs` previously provided.
 *
 * @param {string} name
 * @param {Record<string, unknown>} rawArgs
 * @returns {Record<string, unknown>} SmallCaps-decoded, validated args.
 */
const decodeToolArgs = (name, rawArgs) => {
  // Reconstruct the SmallCaps body from the JSON-parsed args.
  // `rawArgs` came from JSON.parse (Pi already decoded the JSON wire), so
  // JSON.stringify is lossless for all JSON-representable values. The `#`
  // prefix tells fromCapData to parse as smallcaps rather than capdata.
  const body = `#${JSON.stringify(rawArgs)}`;
  /** @type {Record<string, unknown>} */
  const decoded = /** @type {any} */ (
    smallcapsMarshal.fromCapData({ body, slots: [] })
  );

  const pattern = paramsByTool.get(name);
  if (pattern === undefined) return decoded;

  try {
    mustMatch(harden(decoded), pattern, `${name} args`);
    return decoded;
  } catch (err) {
    // Secondary fallback: some smaller LLMs emit nested arrays/objects as
    // JSON-encoded strings even within an otherwise-SmallCaps payload.
    // Retry once with those fields un-JSON-fied (same idea as the old
    // `validateAndFixupArgs` retry).
    if (typeof decoded !== 'object' || decoded === null) throw err;
    let fixedAny = false;
    /** @type {Record<string, unknown>} */
    const next = { ...decoded };
    for (const [key, val] of Object.entries(decoded)) {
      if (typeof val === 'string') {
        try {
          next[key] = JSON.parse(val);
          fixedAny = true;
        } catch {
          // not JSON; leave as-is
        }
      }
    }
    if (!fixedAny) throw err;
    mustMatch(harden(next), pattern, `${name} args`);
    return next;
  }
};

/**
 * Build the executeTool callback bound to a specific guest's powers. The
 * returned function is the `execTool` parameter to `new PiAgent({tools:[...]})`;
 * it must always resolve (errors propagate as the tool's `details`/`content`).
 *
 * @param {any} powers - Guest powers
 * @returns {(name: string, args: ToolCallArgs) => Promise<unknown>}
 */
export const makeExecuteTool = powers => {
  const executeTool = async (name, rawArgs) => {
    // Pi delivers tool args as an already-JSON-parsed plain object.
    // Decode via the rigorous SmallCaps codec: `"+N"` → BigInt, `"!<s>"` →
    // string `<s>`, `"#undefined"` → undefined, etc. Then validate the
    // decoded passables against the tool's @endo/patterns matcher so a
    // malformed args record fails fast with a structured error instead of
    // cascading into a confusing E(powers).<method>() failure mid-dispatch.
    const argsRecord = /** @type {Record<string, unknown>} */ (rawArgs ?? {});
    const args = /** @type {ToolCallArgs} */ (decodeToolArgs(name, argsRecord));
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
        // eslint-disable-next-line no-shadow
        const { name: lookupName } = args;
        if (lookupName !== undefined) {
          const capability = await E(powers).lookup(lookupName);
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
        return E(powers).reply(messageNumber, strings, edgeNames, petNames);
      }
      case 'editMessage': {
        const { messageNumber, strings, edgeNames, petNames, done } = args;
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
        const options = done === undefined ? undefined : harden({ done });
        return E(powers).editMessage(
          messageNumber,
          strings,
          edgeNames,
          petNames,
          options,
        );
      }
      case 'messageHistory': {
        const { messageNumber } = args;
        if (messageNumber === undefined) {
          throw new Error('messageNumber is required');
        }
        return E(powers).messageHistory(messageNumber);
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
          // eslint-disable-next-line no-underscore-dangle
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
        // With SmallCaps decode, `"#undefined"` arrives as JS `undefined`
        // already. The string `"undefined"` is not a SmallCaps constant
        // so it passes through as-is; treat it as the literal undefined
        // sentinel the LLM may emit when it lacks a workerName.
        const workerName =
          rawWorkerName === 'undefined' ? undefined : rawWorkerName;
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

  return executeTool;
};

// ============================================================================
// Worker Loop
// ============================================================================

/**
 * Spawn a worker loop that follows a guest's inbox and processes messages
 * using a pi-agent-core–backed PiAgent. The PiAgent's internal message
 * state is the durable transcript for the worker's lifetime; cross-restart
 * conversation continuity is intentionally not preserved by this migration
 * (see the PR body's *Memory migration* section).
 *
 * @param {any} powers - Guest powers (manager's own or a sub-guest's)
 * @param {Promise<object> | object | null | undefined} context
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string }} workerEnv
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

  // Resolve the model string for pi-ai. lal historically selected a provider
  // from LAL_HOST and a model from LAL_MODEL. The pi-ai registry takes a
  // single "provider/modelId" string instead; we keep accepting the legacy
  // LAL_* variables and translate them.
  const model = resolveModelString(workerEnv);
  if (workerEnv.LAL_AUTH_TOKEN) {
    setProviderApiKey(model, workerEnv.LAL_AUTH_TOKEN);
  }

  // Bind the tool dispatcher to this guest's powers, then build the
  // AgentTool array pi-agent-core consumes directly. We construct the
  // PiAgent in-line (rather than via a higher-level harness helper) so that
  //   (a) we are free to seed `initialState.messages` from prior
  //       transcripts when cross-restart continuity lands (see PR body),
  //   (b) we control the system prompt verbatim (no policy suffix or
  //       security-notes wrapping is applied), and
  //   (c) the per-tool parameter schema lives at the tool boundary,
  //       which lets `@endo/patterns` validation guard inbound args.
  const executeTool = makeExecuteTool(powers);
  const agentTools = toolDefs.map(({ name, summary }) =>
    toAgentTool(name, summary, executeTool),
  );

  const resolvedModel = await resolveModel(model);
  const isOllama = resolvedModel.name?.startsWith('ollama/');

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt,
      model: resolvedModel,
      tools: agentTools,
      messages: [],
      thinkingLevel: resolvedModel.reasoning ? 'medium' : 'off',
    },
    convertToLlm: msgs =>
      msgs.filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant' ||
          m.role === 'toolResult',
      ),
    toolExecution: 'sequential',
    ...(isOllama ? { getApiKey: async _provider => getOllamaApiKey() } : {}),
  });

  /**
   * Run one chat round on the PiAgent, forwarding tool-call activity to
   * the console and dispatching tool errors via the LLM transcript.
   *
   * @param {string} prompt - User-role content for this round.
   */
  const runOneRound = async prompt => {
    for await (const event of runAgentRound(piAgent, prompt)) {
      switch (event.type) {
        case 'ToolCallStart': {
          const argsPreview = (() => {
            try {
              const s =
                typeof event.args === 'string'
                  ? event.args
                  : passableAsJustin(harden(event.args ?? {}), false);
              return s.length > 200 ? `${s.slice(0, 200)}...` : s;
            } catch {
              return '(args)';
            }
          })();
          console.log(`[tool] ${event.toolName}(${argsPreview})`);
          break;
        }
        case 'ToolCallEnd': {
          if ('error' in event && event.error) {
            console.error(
              `[tool] ${event.toolName} error: ${event.error.message}`,
            );
          } else {
            const out = (() => {
              try {
                return passableAsJustin(event.result, false);
              } catch {
                return String(event.result);
              }
            })();
            console.log(`[tool] ${event.toolName} -> ${out}`);
          }
          break;
        }
        case 'Message': {
          if (event.role === 'assistant' && event.content) {
            // The LLM's text response is logged for visibility; lal's
            // protocol is tool-call-only, so any prose surfaces here as a
            // debugging breadcrumb rather than being sent to a peer.
            console.log(`[assistant] ${event.content}`);
          }
          break;
        }
        case 'Error': {
          console.error(`[agent] LLM error: ${event.message}`);
          throw event.cause || new Error(event.message);
        }
        default:
          break;
      }
    }
  };

  /**
   * Build the user-role content for an inbound message. lal's prompt is
   * intentionally minimal: the LLM is expected to call listMessages() to
   * inspect the inbox itself.
   *
   * @returns {string}
   */
  const formatInboundMessage = () =>
    'You have new mail. Check your messages and respond appropriately.';

  /**
   * Run the agent loop, processing incoming messages.
   *
   * @returns {Promise<void>}
   */
  const runAgent = async () => {
    // Announce ourselves with a call to action.
    await E(powers).send(
      '@host',
      [
        "Hello! I'm ready to help.\n\n" +
          'Send me a message to get started — in Chat, type ' +
          '`@` followed by my name and your request.\n\n' +
          'A few things to try:\n' +
          '- Ask me what I can do\n' +
          '- Ask me to list your inventory\n' +
          '- Ask me to help write a program\n\n' +
          'Type `/help` to see all available Chat commands.',
      ],
      [],
      [],
    );

    /** @type {string | undefined} */
    const selfLocator = await E(powers).locate('@self');
    const cancelled = await getCancelled();
    const cancelledSignal = cancelled
      ? cancelled.then(
          () => ({ cancelled: true }),
          () => ({ cancelled: true }),
        )
      : null;

    // Follow messages and route each to the correct transcript chain.
    //
    // Re-emission of an already-processed inbound number indicates the
    // sender called daemon `editMessage`: a partial submission that has
    // settled, or an amendment of an already-settled message.  We do
    // not start a fresh transcript turn for such re-emissions; the
    // agent can call `messageHistory(n)` to retrieve the prior text
    // if it needs to reason about the change.
    /** @type {Set<bigint>} */
    const seenInboundNumbers = new Set();

    const messageIterator = iterateReader(E(powers).followMessages());
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
        /** @type {InboxMessage & {type?: string, messageId?: string, replyTo?: string, done?: boolean}} */ (
          message
        );
      const {
        from: fromLocator,
        number,
        type,
        done: messageDone = true,
      } = inboxMessage;

      // Skip our own outbound messages; only act on inbound mail.
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (fromLocator !== selfLocator) {
        // Skip partial (in-flight) submissions: wait until the sender
        // marks the message done before spinning up an LLM turn.
        if (messageDone === false) {
          console.log(
            `[mail] Message #${number} is not yet done; deferring until settled`,
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        if (seenInboundNumbers.has(number)) {
          console.log(
            `[mail] Message #${number} was edited after settlement; ` +
              `not rerunning. Use messageHistory(${number}) for the prior text.`,
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        seenInboundNumbers.add(number);
        console.log(
          `[mail] New message #${number} (type: ${type || 'package'})`,
        );
        try {
          await runOneRound(formatInboundMessage());
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
      }
    }
  };

  await runAgent();
};
harden(spawnWorkerLoop);

// ============================================================================
// Model + Provider Resolution
// ============================================================================
//
// pi-ai expects a single "provider/modelId" string and reads provider API
// keys from `process.env.<PROVIDER>_API_KEY`. lal's historical configuration
// passes LAL_HOST + LAL_MODEL + LAL_AUTH_TOKEN. The helpers below translate
// the legacy LAL_* variables into the pi-ai shape so existing
// `.env.example` files continue to work.

/**
 * Translate the legacy LAL_HOST + LAL_MODEL pair into a single
 * "provider/modelId" string suitable for pi-ai's getModel(). Recognized
 * LAL_HOST patterns:
 *
 *   contains "anthropic.com"  -> provider "anthropic"
 *   contains "generativelanguage.googleapis.com" or "gemini" -> "google"
 *   contains "openai.com"     -> provider "openai"
 *   contains "openrouter"     -> provider "openrouter"
 *   contains ":11434"         -> provider "ollama"
 *   otherwise (incl. "/v1" llama.cpp servers) -> provider "openai"
 *     (pi-ai's openai-completions adaptor speaks the same protocol)
 *
 * LAL_MODEL is used as the model id; a sensible default is chosen if
 * LAL_MODEL is empty.
 *
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string }} env
 * @returns {string}
 */
function resolveModelString(env) {
  const host = (env.LAL_HOST || 'http://localhost:11434').toLowerCase();
  let provider = 'ollama';
  // Temporary default until the subagent creation wizard ships and can guide
  // users to select a model explicitly.
  let defaultModel = 'qwen3.6';
  if (host.includes('anthropic.com')) {
    provider = 'anthropic';
    defaultModel = 'claude-opus-4-5-20251101';
  } else if (
    host.includes('generativelanguage.googleapis.com') ||
    host.includes('gemini')
  ) {
    // pi-ai exposes Google's Gemini models under the provider name 'google'.
    provider = 'google';
    defaultModel = 'gemini-2.0-flash';
  } else if (host.includes('openrouter')) {
    provider = 'openrouter';
    defaultModel = 'openrouter/auto';
  } else if (host.includes('openai.com')) {
    provider = 'openai';
    defaultModel = 'gpt-4o-mini';
  } else if (host.includes(':11434')) {
    // Native Ollama port.
    // Temporary default until the subagent creation wizard ships.
    provider = 'ollama';
    defaultModel = 'qwen3.6';
  } else if (host.includes('/v1')) {
    // Any OpenAI-compatible local server (llama.cpp, vLLM, tgi).
    provider = 'openai';
    defaultModel = 'qwen3';
  }
  const modelId = env.LAL_MODEL || defaultModel;
  return `${provider}/${modelId}`;
}

/**
 * Install the caller-supplied API key into the appropriate environment
 * variable so pi-ai's provider adaptor finds it. We avoid clobbering an
 * already-set variable; this is best-effort and explicitly per-worker.
 *
 * @param {string} modelString - "provider/modelId"
 * @param {string} authToken
 */
function setProviderApiKey(modelString, authToken) {
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env;
  if (!env) return;
  const [provider] = modelString.split('/');
  const keyName = `${provider.toUpperCase()}_API_KEY`;
  if (!env[keyName] || env[keyName] === 'ollama') {
    env[keyName] = authToken;
  }
}

/**
 * Resolve a "provider/modelId" string into a pi-ai Model object. Known
 * providers go through `getModel(provider, modelId)`; the `ollama/` prefix
 * is treated specially (Ollama is not in pi-ai's built-in registry and
 * exposes an OpenAI-compatible /v1 endpoint).
 *
 * @param {string} modelString
 * @returns {Promise<Model<'openai-completions'>>}
 */
async function resolveModel(modelString) {
  const parts = modelString.split('/');
  const provider = parts[0];
  const modelId = parts.slice(1).join('/');
  if (provider === 'ollama') {
    return buildOllamaModel(modelId);
  }
  // pi-ai's KnownProvider overloads of getModel typically resolve the modelId
  // to `never` for the generic call site; we want the runtime registry lookup
  // here, which works for any string the caller passed.
  // @ts-expect-error - permissive runtime lookup against KnownProvider overloads
  return getModel(provider, modelId);
}

/**
 * Build a pi-ai Model object for a local Ollama instance. Ollama exposes
 * an OpenAI-compatible /v1/chat/completions endpoint, so we masquerade as
 * the "openai" provider with a custom baseUrl.
 *
 * @param {string} id - The ollama model name (e.g. "qwen3")
 * @returns {Promise<Model<'openai-completions'>>}
 */
async function buildOllamaModel(id) {
  await Promise.resolve();
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env ?? {};
  const ollamaHost = env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  return harden({
    id,
    name: `ollama/${id}`,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: `${ollamaHost}/v1`,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 8192,
  });
}

/**
 * API-key resolver for Ollama models. Ollama itself does not require a key,
 * but pi-ai's openai-completions adaptor refuses requests without one.
 * Prefer `OLLAMA_API_KEY` (in case the operator has set one for a remote
 * Ollama), else fall back to a harmless sentinel that the operator's setup
 * commonly uses already.
 *
 * @returns {string}
 */
function getOllamaApiKey() {
  // eslint-disable-next-line no-undef
  const env = globalThis?.process?.env ?? {};
  return env.OLLAMA_API_KEY || 'ollama';
}

/**
 * Convert a lal tool definition into a pi-agent-core AgentTool. The
 * `parameters` field is a permissive open-object schema; per-tool argument
 * validation lives in `executeTool` (SmallCaps decode via `decodeToolArgs`
 * plus the `@endo/patterns` matcher). When pi-agent-core's tool-schema
 * forwarding stabilizes we can promote the per-tool schemas into this field.
 *
 * @param {string} name
 * @param {string} summary
 * @param {(name: string, args: any) => Promise<any>} executeTool
 * @returns {AgentTool<any>}
 */
export function toAgentTool(name, summary, executeTool) {
  return {
    name,
    label: name,
    description: summary,
    parameters: { type: 'object', additionalProperties: true },
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const result = await executeTool(name, params);
      // Encode the tool result as SmallCaps so the model reads BigInts as
      // `"+N"` strings (consistent with the encoding it must produce for
      // inbound messageNumber fields) and strings starting with special
      // chars as `"!<s>"`. `toCapData` produces `{ body: '#<json>', slots: [] }`;
      // we strip the `#` sentinel and present the SmallCaps JSON directly.
      let text;
      if (typeof result === 'string') {
        // Plain-string results need no SmallCaps wrapping; they carry no
        // non-JSON values.
        text = result;
      } else {
        const { body } = smallcapsMarshal.toCapData(harden(result));
        // body is '#<smallcaps-json>'; slice off the '#' sentinel so the
        // model reads the raw SmallCaps JSON object/array.
        text = body.slice(1);
      }
      /** @type {AgentToolResult<any>} */
      const toolResult = {
        content: [{ type: 'text', text }],
        details: result,
      };
      return toolResult;
    },
  };
}

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

    const messageIterator = iterateReader(E(powers).followMessages());
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
            // Guard with has() so restart re-uses the existing guest;
            // re-running provideGuest on an existing name throws
            // "Formula already exists".
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
