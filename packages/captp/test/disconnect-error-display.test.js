// @ts-check
// Repro for endojs/endo-but-for-bots#171
// "Unhandled-rejection trap: empty-object reasons render as `{}`
//  (Error own-property invisibility)".
//
// This file is the language-layer sentinel for #171: it pins the
// underlying ECMA-262 fact that a host transport which naively
// `JSON.stringify`s a CapTP envelope containing an `Error` reason will
// emit `{}` for the reason, because `Error`'s own properties (`message`,
// `stack`, `name`) are spec-defined non-enumerable.
//
// CapTP itself does not encode bytes: the host of `makeCapTP` supplies a
// `send` callback that frames the protocol envelope. The most obvious
// choice (`JSON.stringify`, used by `@endo/daemon/src/connection.js`'s
// `messageToBytes`) is the one that loses the Error's message.
//
// The assertions below pass today and will continue to pass after a fix
// to the daemon's transport (the language behavior under audit does not
// change). The matching regression test that fails until the daemon's
// transport is fixed lives in `@endo/daemon/test/disconnect-error-display.test.js`.
//
// Why this lives in captp and not daemon: CapTP owns the
// `{ type: 'CTP_DISCONNECT', epoch, reason }` envelope shape (see
// `@endo/captp/src/captp.js`'s `abort` and `CTP_DISCONNECT` dispatch
// entry). The fact that any host plugging `JSON.stringify` into the
// `send` callback will drop Error reasons is a property of the
// CapTP-protocol-meets-naive-transport boundary, not specifically of
// the daemon.

import test from '@endo/ses-ava/test.js';

test('JSON.stringify on a bare Error reason emits {}', t => {
  // The ECMA-262 spec defines `Error`'s `message`, `stack`, and `name`
  // properties as non-enumerable. `JSON.stringify` walks only own
  // enumerable string-keyed properties, so an Error has nothing to
  // emit and reduces to the empty-object literal. SES does not change
  // this. Any diagnostic renderer downstream that funnels reasons
  // through `JSON.stringify` therefore loses the message text on
  // every Error, regardless of how the Error reached it.
  const reason = Error('inflagrante');
  t.is(JSON.stringify(reason), '{}');
});

test('CTP_DISCONNECT envelope JSON-stringified loses the Error reason message', t => {
  // Applying the language-level fact above to the CapTP disconnect
  // envelope: a host transport that frames the envelope with
  // `JSON.stringify` emits `"reason":{}` even when the original reason
  // was a fully-populated `Error`. Round-tripping confirms the
  // receiving side reconstructs `reason` as a plain empty object, so
  // any subsequent rendering that does `reason?.message || reason`
  // prints the empty-object form rather than the original message.
  const reason = Error('inflagrante');
  const envelope = { type: 'CTP_DISCONNECT', epoch: 0, reason };
  const wire = JSON.stringify(envelope);
  t.is(wire, '{"type":"CTP_DISCONNECT","epoch":0,"reason":{}}');

  const decoded = JSON.parse(wire);
  t.deepEqual(decoded.reason, {});
  t.is(decoded.reason.message, undefined);
});
