// @ts-check
// Regression test for endojs/endo-but-for-bots#171
// "Unhandled-rejection trap: empty-object reasons render as `{}`
//  (Error own-property invisibility)".
//
// When a CapTP `CTP_DISCONNECT.reason` carries an `Error` instance, the
// JSON-encoded form on the wire is `{}` because `Error`'s own properties
// (`message`, `stack`, `name`) are non-enumerable and therefore invisible
// to `JSON.stringify`.
//
// The test below pins the symptom at two layers:
//
// 1. The wire encode/decode round-trip itself: an `Error` reason
//    sent through `messageToBytes` arrives at the peer as `{}`.
//    A passing assertion here would mean the wire format preserves
//    enough information to reconstruct the Error's message.
//
// 2. The receiver-side rendering: `defaultOnReject`-shaped diagnostic
//    formatting (the same pattern used inline in `connection.js`) on
//    the round-tripped reason produces a string that does NOT contain
//    the original Error's message, only the literal `'[object Object]'`
//    or `'{}'` rendering of an empty object.
//
// Both assertions fail on the current `bots-ssh/llm` tip. A fix that
// preserves Error structure across the wire (per the Suggested Direction
// in #171) makes both pass.

import test from '@endo/ses-ava/prepare-endo.js';

import { inspect } from 'node:util';

import { messageToBytes, bytesToMessage } from '../src/connection.js';

/**
 * Mirrors the inline `defaultOnReject` in `daemon/src/connection.js`,
 * but captures its arguments instead of writing to stderr. The test
 * asserts on what `console.error` would have rendered.
 *
 * @param {string} name
 */
const makeCapturingOnReject = name => {
  /** @type {string[]} */
  const captured = [];
  /** @param {any} err */
  const onReject = err => {
    // The `inspect` call mirrors what Node's `console.error` does to
    // format non-string arguments before writing them. The receiver-side
    // trap currently does
    //   `console.error('CapTP', name, 'exception:', err?.message || err,
    //                  err?.stack || '')`
    // so the rendered string is the concatenation of those four formatted
    // arguments.
    const msg = err?.message || err;
    const stack = err?.stack || '';
    captured.push(`CapTP ${name} exception: ${inspect(msg)} ${inspect(stack)}`);
  };
  return { onReject, captured };
};

test('Error reason on CTP_DISCONNECT survives wire round-trip with its message', t => {
  const reason = Error('boom');
  const message = harden({
    type: 'CTP_DISCONNECT',
    epoch: 0,
    reason,
  });
  const bytes = messageToBytes(message);
  const decoded = bytesToMessage(bytes);

  t.is(decoded.type, 'CTP_DISCONNECT');
  t.is(decoded.epoch, 0);
  // The Error's `message` is the load-bearing field for triage.
  // A wire format that strips it makes downstream display useless.
  t.true(
    decoded.reason !== undefined && decoded.reason !== null,
    'reason should not be undefined or null after round-trip',
  );
  // `JSON.stringify(Error('boom'))` yields `'{}'` today because
  // Error own-properties are non-enumerable. The fix must preserve
  // the message text in some form on the wire.
  const reasonJson = JSON.stringify(decoded.reason);
  t.not(
    reasonJson,
    '{}',
    'round-tripped Error reason serializes to the empty object',
  );
});

test('round-tripped Error reason rendered through onReject contains the original message', t => {
  const reason = Error('inflagrante');
  const message = harden({
    type: 'CTP_DISCONNECT',
    epoch: 0,
    reason,
  });
  const decoded = bytesToMessage(messageToBytes(message));

  const { onReject, captured } = makeCapturingOnReject('test-peer');
  onReject(decoded.reason);

  t.is(captured.length, 1, 'onReject should have been called exactly once');
  const rendered = captured[0];
  t.true(
    rendered.includes('inflagrante'),
    `onReject diagnostic should contain the original Error message; got ${JSON.stringify(rendered)}`,
  );
});
