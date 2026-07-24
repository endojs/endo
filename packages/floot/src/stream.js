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

import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';

/**
 * @typedef {(
 *   | { type: 'phase', phase: string }
 *   | { type: 'delta', text: string }
 *   | { type: 'final', text: string }
 *   | { type: 'tool_call', id: string, name: string, args: string }
 *   | { type: 'tool_result', id: string, name: string, result: string }
 *   | { type: 'usage', inputTokens: number, outputTokens: number, turns: number }
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
  const { push, reader } = makeBufferedReader({ onClose });

  const writer = harden({
    /** @param {string} phase */
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    /** @param {string} text */
    delta: text => push({ type: 'delta', text: `${text}` }),
    /** @param {string} text */
    final: text => push({ type: 'final', text: `${text}` }),
    /** @param {{ id: string, name: string, args: string }} call */
    toolCall: ({ id, name, args }) =>
      push({
        type: 'tool_call',
        id: `${id}`,
        name: `${name}`,
        args: `${args}`,
      }),
    /** @param {{ id: string, name: string, result: string }} result */
    toolResult: ({ id, name, result }) =>
      push({
        type: 'tool_result',
        id: `${id}`,
        name: `${name}`,
        result: `${result}`,
      }),
    /** @param {{ inputTokens: number, outputTokens: number, turns: number }} u */
    usage: u =>
      push({
        type: 'usage',
        inputTokens: Math.trunc(u.inputTokens) || 0,
        outputTokens: Math.trunc(u.outputTokens) || 0,
        turns: Math.trunc(u.turns) || 0,
      }),
    end: () => push({ type: 'end' }),
    /** @param {unknown} reason */
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  });

  return { writer, reader };
};
harden(makeReplyChannel);
