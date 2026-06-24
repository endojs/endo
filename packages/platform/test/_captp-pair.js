// @ts-nocheck
/* global queueMicrotask, setTimeout */

/**
 * Two-vat CapTP harness shared across `pipelined-rtt.test.js`
 * and `cas.test.js`. Hosts `bootstrap` on a "right" vat and
 * connects a "left" vat to it via `makeCapTP`; every wire
 * message in either direction is summarised into a shared
 * `transcript` array.
 *
 * The leading underscore in the filename keeps ava from picking
 * this up as a test file.
 */

import { makeCapTP } from '@endo/captp';

/**
 * Connect a "left" client to a "right" server that exposes
 * `bootstrap` as its bootstrap presence.
 *
 * Cross-side delivery is deferred via `queueMicrotask` (default)
 * or `setTimeout(latency)`. Deferring is what makes the
 * interleaved send/receive order observable: the right vat
 * can't reply until the left vat has finished issuing whatever
 * messages it queued in the current synchronous turn.
 *
 * @param {object} bootstrap
 * @param {{ deliveryLatencyMs?: number }} [opts]
 */
export const makeConnectedPair = (bootstrap, opts = {}) => {
  const { deliveryLatencyMs = 0 } = opts;
  /** @type {Array<object>} */
  const transcript = [];

  // `rightDispatch` is forward-declared with `let` because the
  // left vat's `send` closure refers to it before the right vat
  // is constructed. `leftDispatch` can be `const` because it's
  // assigned before the right vat's `send` closes over it.
  /** @type {(o: any) => void} */
  let rightDispatch;

  // Reduce a wire message to the fields a reader cares about.
  // `method` is a marshalled `[propName, args]` (or `[propName]`
  // for getters); extract just the method name.
  const summarise = (from, to, msg) => {
    /** @type {Record<string, any>} */
    const entry = { from, to, type: msg.type };
    if (msg.questionID !== undefined) entry.questionID = msg.questionID;
    if (msg.answerID !== undefined) entry.answerID = msg.answerID;
    if (msg.target !== undefined) entry.target = msg.target;
    if (msg.method && typeof msg.method.body === 'string') {
      try {
        const parsed = JSON.parse(msg.method.body);
        if (Array.isArray(parsed)) entry.method = parsed[0];
      } catch {
        // ignore — leave method out of the summary
      }
    }
    transcript.push(entry);
  };

  const defer = fn => {
    if (deliveryLatencyMs > 0) {
      setTimeout(fn, deliveryLatencyMs);
    } else {
      queueMicrotask(fn);
    }
  };

  const leftCapTP = makeCapTP('left', o => {
    summarise('left', 'right', o);
    defer(() => rightDispatch(o));
  });
  const leftDispatch = leftCapTP.dispatch;

  const rightCapTP = makeCapTP(
    'right',
    o => {
      summarise('right', 'left', o);
      defer(() => leftDispatch(o));
    },
    bootstrap,
  );
  rightDispatch = rightCapTP.dispatch;

  return {
    bootstrapRef: leftCapTP.getBootstrap(),
    transcript,
  };
};

/** Wait long enough for queued microtasks/timers to drain. */
export const settle = async (n = 5) => {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await null;
  }
};
