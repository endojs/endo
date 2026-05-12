// @ts-check
// Coverage for `renderRejection` and the extended `messageToBytes`
// behavior introduced for endojs/endo-but-for-bots#171. The two
// regression tests in `disconnect-error-display.test.js` (from PR
// #174) pin the original symptom; this file pins the additional
// shapes the design's test plan calls out.

import test from '@endo/ses-ava/prepare-endo.js';

import {
  bytesToMessage,
  messageToBytes,
  renderRejection,
} from '../src/connection.js';

class CustomError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CustomError';
  }
}

test('renderRejection formats a real Error with name, message, and stack', t => {
  const err = Error('boom');
  const rendered = renderRejection(err);
  t.true(rendered.startsWith('Error: boom\n'), rendered);
  t.true(rendered.includes(err.stack || ''), rendered);
});

test('renderRejection formats a custom Error subclass with its name', t => {
  const err = new CustomError('detonated');
  const rendered = renderRejection(err);
  t.true(rendered.startsWith('CustomError: detonated\n'), rendered);
});

test('renderRejection formats the @@error sentinel shape from the wire', t => {
  const wireShape = harden({
    '@@error': true,
    name: 'TypeError',
    message: 'unexpected',
    stack: 'TypeError: unexpected\n    at <anonymous>',
  });
  const rendered = renderRejection(wireShape);
  t.is(
    rendered,
    'TypeError: unexpected\nTypeError: unexpected\n    at <anonymous>',
  );
});

test('renderRejection falls back to defaults for a sentinel with missing fields', t => {
  const wireShape = harden({ '@@error': true });
  const rendered = renderRejection(wireShape);
  t.is(rendered, 'Error: \n');
});

test('renderRejection renders a Passable string through passableAsJustin', t => {
  const rendered = renderRejection('connection lost');
  // `passableAsJustin` quotes strings.
  t.is(rendered, '"connection lost"');
});

test('renderRejection renders a Passable record through passableAsJustin', t => {
  const rendered = renderRejection(harden({ code: 42 }));
  t.true(rendered.includes('42'), rendered);
  t.true(rendered.includes('code'), rendered);
});

test('renderRejection annotates a non-Passable function reason with its type', t => {
  const fn = () => undefined;
  const rendered = renderRejection(fn);
  t.true(rendered.startsWith('(non-passable function)'), rendered);
});

test('renderRejection handles undefined and null reasons', t => {
  // `undefined` is a Passable; `passableAsJustin(undefined)` is
  // `"undefined"`.
  t.is(renderRejection(undefined), 'undefined');
  // `null` is also Passable.
  t.is(renderRejection(null), 'null');
});

test('messageToBytes preserves a custom Error subclass name on the wire', t => {
  const reason = new CustomError('detonated');
  const message = harden({ type: 'CTP_DISCONNECT', epoch: 0, reason });
  const decoded = bytesToMessage(messageToBytes(message));
  t.is(decoded.reason['@@error'], true);
  t.is(decoded.reason.name, 'CustomError');
  t.is(decoded.reason.message, 'detonated');
  t.is(typeof decoded.reason.stack, 'string');
});

test('messageToBytes leaves non-Error reasons unchanged on the wire', t => {
  const message = harden({
    type: 'CTP_DISCONNECT',
    epoch: 0,
    reason: 'connection lost',
  });
  const decoded = bytesToMessage(messageToBytes(message));
  t.is(decoded.reason, 'connection lost');
});

test('messageToBytes leaves non-CTP_DISCONNECT messages with Error fields untouched', t => {
  // A non-disconnect message that carries an Error somewhere in the
  // tree should not be mangled by the disconnect-specific encoding.
  const message = harden({
    type: 'CTP_CALL',
    epoch: 0,
    reason: Error('not actually a disconnect reason'),
  });
  const decoded = bytesToMessage(messageToBytes(message));
  // `JSON.stringify` still strips the Error to `{}` because the
  // disconnect guard does not fire for `CTP_CALL`. The hot path
  // remains the responsibility of `@endo/marshal` for non-disconnect
  // traffic.
  t.deepEqual(decoded.reason, {});
});
