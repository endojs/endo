// @ts-check
// Buffered StreamReader exo paired with an imperative `push`. A producer pushes
// events as they occur; the caller pulls them over CapTP via `next()`. The
// buffer lets the producer run ahead of a slow consumer, and `next()` parks on a
// promise when caught up.
//
// `onClose` fires when the *consumer* stops pulling (return/throw) before the
// stream finished, so the producer (here, an in-flight `claude -p` turn) can be
// aborted instead of left running for no one.
//
// Ported verbatim from `packages/floot/src/buffered-channel.js` (the floot
// session's reply wire) so the two sessions can later share one primitive and
// one interface guard. Keep it byte-identical to floot's copy.

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const BufferedReaderInterface = M.interface('BufferedReader', {
  next: M.call().returns(M.promise()),
  return: M.call().returns(M.promise()),
  throw: M.call(M.error()).returns(M.promise()),
});

/**
 * Terminal events close the stream; they match across all wires.
 * @param event
 */
const isTerminal = event => event.type === 'end' || event.type === 'abort';

/**
 * @param {string} name Exo interface name for the reader.
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
  // A FIFO of parked next() resolvers. A single slot would drop an earlier
  // parker when a second next() overlaps it, hanging that call forever; draining
  // every waiter keeps concurrent consumers safe (each re-checks on wake).
  /** @type {Array<() => void>} */
  const waiters = [];
  let closeHook = onClose;

  const drainWake = () => {
    while (waiters.length) {
      const wake = waiters.shift();
      if (wake) wake();
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

  const reader = makeExo(name, BufferedReaderInterface, {
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
          waiters.push(() => resolve(undefined));
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
