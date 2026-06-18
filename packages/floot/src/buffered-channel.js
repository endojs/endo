// @ts-check
// Shared core for Floot's userspace streaming wires: a buffered Far
// StreamReader paired with an imperative `push`. A producer pushes events as
// they occur; the caller pulls them over CapTP via `next()`. The buffer lets
// the producer run ahead of a slow consumer, and `next()` parks on a promise
// when caught up.
//
// The reply, transcript, and audio wires all share this mechanism and differ
// only in their event vocabulary (which each call site layers on as a thin
// `writer`) — so the buffering, wake/park loop, terminal detection, and
// consumer-stop (`return`/`throw`) handling live here once.
//
// `onClose` fires when the *consumer* stops pulling (return/throw) before the
// stream finished, so a producer (e.g. piper/moonshine) can be aborted instead
// of left synthesizing for no one. It can be supplied up front or set later via
// `setOnClose` (the transcript wire wires it after construction).

import { Far } from '@endo/far';

/** Terminal events close the stream; they match across all wires. */
const isTerminal = event => event.type === 'end' || event.type === 'abort';

/**
 * @param {string} name Far interface name for the reader.
 * @param {{ onClose?: (() => void) | null }} [opts]
 * @returns {{
 *   push: (event: object) => void,
 *   reader: object,
 *   isClosed: () => boolean,
 *   setOnClose: (fn: () => void) => void,
 * }}
 */
export const makeBufferedReader = (name, { onClose = null } = {}) => {
  const buffer = [];
  let finished = false;
  let cursor = 0;
  /** @type {(() => void) | null} */
  let wake = null;
  let closeHook = onClose;

  const drainWake = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  const push = event => {
    if (finished) return;
    buffer.push(harden(event));
    if (isTerminal(event)) finished = true;
    drainWake();
  };

  // Consumer stopped pulling: finish, unblock any parked next(), and signal the
  // producer so in-flight work is aborted rather than left running.
  const finalize = () => {
    const wasFinished = finished;
    finished = true;
    cursor = buffer.length;
    drainWake();
    if (!wasFinished && closeHook) closeHook();
  };

  const reader = Far(name, {
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
          wake = () => resolve(undefined);
        });
      }
    },
    return: async () => {
      finalize();
      return harden({ value: undefined, done: true });
    },
    throw: async error => {
      finalize();
      throw error;
    },
  });

  return {
    push,
    reader,
    isClosed: () => finished,
    setOnClose: fn => {
      closeHook = fn;
    },
  };
};
harden(makeBufferedReader);
