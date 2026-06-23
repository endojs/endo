// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/**
 * Tool dispatch for the Lal agent.
 *
 * The set of tools the LLM can call is built up from per-family files
 * under `tools/`; the aggregated `tools` array lives in `tools/index.js`.
 * This module owns the rigorous SmallCaps decode of inbound tool args, the
 * `@endo/patterns` validation, the single `switch` that maps tool names to
 * `E(powers)` calls, and the SmallCaps encode of tool results.
 *
 * - `makeExecuteTool(powers)` returns the `execTool` callback `PiAgent`
 *   calls when the LLM emits a tool call.
 * - `toAgentTool(name, summary, executeTool)` wraps that callback in the
 *   permissive open-object `AgentTool` shape pi-agent-core ships today
 *   (per-tool argument validation happens inside `executeTool`).
 */

import { mustMatch } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeMarshal } from '@endo/marshal';

import { tools } from './tools/index.js';

/** @import { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core' */
/** @import { ToolCallArgs, InboxMessage } from './agent.types.js' */

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
  tools.filter(t => t.params !== undefined).map(t => [t.name, t.params]),
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
harden(makeExecuteTool);

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
harden(toAgentTool);
