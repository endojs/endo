// @ts-check
/**
 * Mail / inbox tools: enumerating messages and responding to them via
 * resolve, reject, dismiss, request, send, reply, editMessage, and
 * messageHistory.
 *
 * (Note: `adopt` is mail-triggered but petname-shaped in effect and lives
 * in petnames.js with the other directory mutators.)
 *
 * @import { Pattern } from '@endo/patterns'
 */

import { M } from '@endo/patterns';
import { NameOrPathShape } from '@endo/daemon/type-guards.js';

/** @import { LalToolDef } from './index.js' */

const MessageNumberShape = M.or(M.bigint(), M.number());

/** @type {LalToolDef[]} */
export const mailToolDefs = harden([
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
    name: 'editMessage',
    summary: `\
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

  {
    name: 'messageHistory',
    summary: `\
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
]);
