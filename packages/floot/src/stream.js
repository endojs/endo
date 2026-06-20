// @ts-check
// Userspace streaming primitive: a buffered Far StreamReader paired with a
// plain-object writer. The agent loop writes reply events as the LLM emits
// tokens; the caller pulls them over CapTP via next() — exactly the shape the
// voice Space already consumes for transcripts (audio-server-caplet.js).
//
// Reply events (append-style — LLM tokens accrete, they do not revise, so
// unlike the moonshine transcript wire these are deltas, not full snapshots):
//   { type: 'phase', phase }              coarse status ('thinking')
//   { type: 'delta', text }               next chunk of assistant text
//   { type: 'final', text }               the complete assistant message
//   { type: 'tool_call', name, args }     a tool the agent is invoking (args JSON string)
//   { type: 'tool_result', name, result } that tool's output (result string)
//   { type: 'end' }                       stream complete
//   { type: 'abort', reason }             stream failed

import { makeBufferedReader } from './buffered-channel.js';

/**
 * @typedef {(
 *   | { type: 'phase', phase: string }
 *   | { type: 'delta', text: string }
 *   | { type: 'final', text: string }
 *   | { type: 'tool_call', name: string, args: string }
 *   | { type: 'tool_result', name: string, result: string }
 *   | { type: 'end' }
 *   | { type: 'abort', reason: string }
 * )} ReplyEvent
 */

/**
 * Create a writer + Far StreamReader pair backed by an in-memory buffer.
 *
 * @param {(() => void) | null} [onClose] Fires when the consumer stops pulling
 *   (reader.return/throw) before the stream finished, so the producer (the
 *   in-flight agent turn) can be aborted rather than left generating for no one.
 * @returns {{ writer: object, reader: object }}
 */
export const makeReplyChannel = (onClose = null) => {
  const { push, reader } = makeBufferedReader('ReplyReader', { onClose });

  const writer = harden({
    /** @param {string} phase */
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    /** @param {string} text */
    delta: text => push({ type: 'delta', text: `${text}` }),
    /** @param {string} text */
    final: text => push({ type: 'final', text: `${text}` }),
    /** @param {{ name: string, args: string }} call */
    toolCall: ({ name, args }) =>
      push({ type: 'tool_call', name: `${name}`, args: `${args}` }),
    /** @param {{ name: string, result: string }} result */
    toolResult: ({ name, result }) =>
      push({ type: 'tool_result', name: `${name}`, result: `${result}` }),
    end: () => push({ type: 'end' }),
    /** @param {unknown} reason */
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  });

  return { writer, reader };
};
harden(makeReplyChannel);
