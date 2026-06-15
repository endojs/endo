// @ts-check
// Userspace streaming primitive: a buffered Far StreamReader paired with a
// plain-object writer. The agent loop writes reply events as the LLM emits
// tokens; the caller pulls them over CapTP via next() — exactly the shape the
// voice Space already consumes for transcripts (audio-server-caplet.mjs).
//
// Reply events (append-style — LLM tokens accrete, they do not revise, so
// unlike the moonshine transcript wire these are deltas, not full snapshots):
//   { type: 'phase', phase }   coarse status ('thinking')
//   { type: 'delta', text }    next chunk of assistant text
//   { type: 'final', text }    the complete assistant message (for convenience)
//   { type: 'end' }            stream complete
//   { type: 'abort', reason }  stream failed

import { Far } from '@endo/far';

/**
 * @typedef {(
 *   | { type: 'phase', phase: string }
 *   | { type: 'delta', text: string }
 *   | { type: 'final', text: string }
 *   | { type: 'end' }
 *   | { type: 'abort', reason: string }
 * )} ReplyEvent
 */

/**
 * Create a writer + Far StreamReader pair backed by an in-memory buffer.
 *
 * @returns {{ writer: object, reader: import('@endo/far').FarRef<object> }}
 */
export const makeReplyChannel = () => {
  /** @type {ReplyEvent[]} */
  const buffer = [];
  let finished = false;
  let cursor = 0;
  /** @type {(() => void) | null} */
  let wake = null;

  const drainWake = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  /** @param {ReplyEvent} event */
  const push = event => {
    if (finished) return;
    buffer.push(harden(event));
    if (event.type === 'end' || event.type === 'abort') finished = true;
    drainWake();
  };

  const writer = harden({
    /** @param {string} phase */
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    /** @param {string} text */
    delta: text => push({ type: 'delta', text: `${text}` }),
    /** @param {string} text */
    final: text => push({ type: 'final', text: `${text}` }),
    end: () => push({ type: 'end' }),
    /** @param {unknown} reason */
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  });

  const reader = Far('ReplyReader', {
    next: async () => {
      for (;;) {
        if (cursor < buffer.length) {
          const value = buffer[cursor];
          cursor += 1;
          return harden({ value, done: false });
        }
        if (finished) return harden({ value: undefined, done: true });
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => {
          wake = resolve;
        });
      }
    },
    return: async () => {
      finished = true;
      cursor = buffer.length;
      drainWake();
      return harden({ value: undefined, done: true });
    },
    throw: async error => {
      finished = true;
      cursor = buffer.length;
      drainWake();
      throw error;
    },
  });

  return { writer, reader };
};
harden(makeReplyChannel);
