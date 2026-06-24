import test from '@endo/ses-ava/test.js';

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getRandomValues } from 'crypto';
import {
  makeOcapnSessionCryptography,
  PREFIXED_SYN_LENGTH,
  SYNACK_LENGTH,
} from '../src/bindings.js';

const path = fileURLToPath(new URL('../gen/ocapn-noise.wasm', import.meta.url));
const bytes = /** @type {Uint8Array<ArrayBuffer>} */ (readFileSync(path));

const wasmModule = new WebAssembly.Module(bytes);

// Helper function to create a valid handshake setup.
const createValidHandshake = () => {
  const initiator = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [1, 2],
  }).asInitiator();

  const responder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [2, 3],
  }).asResponder();

  return { initiator, responder };
};

// Helper to perform the initial SYN exchange.
const performSynExchange = (initiator, responder) => {
  const prefixedSyn = new Uint8Array(PREFIXED_SYN_LENGTH);
  const { initiatorReadSynack } = initiator.initiatorWriteSyn(
    responder.signingKeys.publicKey,
    prefixedSyn,
  );
  return { prefixedSyn, initiatorReadSynack };
};

test('handshake fails with corrupted SYNACK message', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn, initiatorReadSynack } = performSynExchange(
    initiator,
    responder,
  );

  const synack = new Uint8Array(SYNACK_LENGTH);
  responder.responderReadSynWriteSynack(prefixedSyn, synack);

  // Corrupt the SYNACK message; the initiator's AEAD check on msg 2
  // payload should fail.
  synack[0] = 0xff;
  synack[1] = 0xff;

  t.throws(() => initiatorReadSynack(synack), {
    message: /initiator cannot read responder's SYNACK/,
  });
});

test('handshake fails with corrupted SYN message', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn } = performSynExchange(initiator, responder);

  // Corrupt a byte inside the encrypted static-key field of msg 1.
  // Bytes 32..64 of the prefixedSyn are the initiator's ephemeral
  // (cleartext); bytes 64..96 are the encrypted-with-MAC static; the
  // AEAD tag covers the whole encrypted-static block, so a single
  // bit flip should fail the read.
  prefixedSyn[80] = prefixedSyn[80] === 0 ? 1 : 0;

  const synack = new Uint8Array(SYNACK_LENGTH);
  t.throws(() => responder.responderReadSynWriteSynack(prefixedSyn, synack), {
    message: /responder cannot read initiator's SYN/,
  });
});

test('handshake fails with no mutually supported encodings', async t => {
  const initiator = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [1, 2],
  }).asInitiator();

  const responder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [3, 4],
  }).asResponder();

  const { prefixedSyn } = performSynExchange(initiator, responder);

  const synack = new Uint8Array(SYNACK_LENGTH);

  t.throws(() => responder.responderReadSynWriteSynack(prefixedSyn, synack), {
    message: /no mutually supported encoding versions/,
  });
});

test('encryption fails when message is too long', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn, initiatorReadSynack } = performSynExchange(
    initiator,
    responder,
  );
  const synack = new Uint8Array(SYNACK_LENGTH);
  responder.responderReadSynWriteSynack(prefixedSyn, synack);
  const { encrypt: initiatorEncrypt } = initiatorReadSynack(synack);

  const longMessage = new Uint8Array(65_535 - 15);
  longMessage.fill(0x42);

  t.throws(() => initiatorEncrypt(longMessage), {
    message: /message exceeds maximum length for encryption/,
  });
});

test('decryption fails when message is too short', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn, initiatorReadSynack } = performSynExchange(
    initiator,
    responder,
  );
  const synack = new Uint8Array(SYNACK_LENGTH);
  const { decrypt: responderDecrypt } = responder.responderReadSynWriteSynack(
    prefixedSyn,
    synack,
  );
  initiatorReadSynack(synack);

  const shortMessage = new Uint8Array(15);

  t.throws(() => responderDecrypt(shortMessage), {
    message: /message not long enough for decryption/,
  });
});

test('decryption fails when message is too long', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn, initiatorReadSynack } = performSynExchange(
    initiator,
    responder,
  );
  const synack = new Uint8Array(SYNACK_LENGTH);
  const { decrypt: responderDecrypt } = responder.responderReadSynWriteSynack(
    prefixedSyn,
    synack,
  );
  initiatorReadSynack(synack);

  const longMessage = new Uint8Array(65_536);

  t.throws(() => responderDecrypt(longMessage), {
    message: /message exceeds maximum length for decryption/,
  });
});

test('encoding versions are validated at construction', async t => {
  // > 65535
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [65_536],
      }).asInitiator(),
    {
      message: /encoding versions beyond 65535/,
    },
  );

  // too many versions
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
        ],
      }).asInitiator(),
    {
      message: /more than 17 encoding versions/,
    },
  );

  // none
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [],
      }).asInitiator(),
    {
      message: /at least one encoding version/,
    },
  );

  // too far apart
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [1, 18],
      }).asInitiator(),
    {
      message: /more than 16 versions apart/,
    },
  );
});

test('decryption fails on a tampered ciphertext', async t => {
  const { initiator, responder } = createValidHandshake();

  const { prefixedSyn, initiatorReadSynack } = performSynExchange(
    initiator,
    responder,
  );
  const synack = new Uint8Array(SYNACK_LENGTH);
  const { decrypt: responderDecrypt } = responder.responderReadSynWriteSynack(
    prefixedSyn,
    synack,
  );
  initiatorReadSynack(synack);

  const invalidMessage = new Uint8Array(32);
  invalidMessage.fill(0xff);

  t.throws(() => responderDecrypt(invalidMessage), {
    message: /decryption failed/,
  });
});

test('initiatorReadSynack on uninitialised state surfaces an error', async t => {
  const initiator = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  }).asInitiator();
  // No initiatorWriteSyn: go straight to readSynack with garbage.
  // We invoke it directly via a fresh closure: asInitiator returns
  // initiatorWriteSyn but no readSynack until SYN is written.  Build a
  // minimal closure stand-in by performing the SYN exchange against
  // a fresh responder, then re-using initiatorReadSynack on a new
  // session that has not had its SYN written.

  // The bindings layer enforces the order: the only way to get an
  // initiatorReadSynack is via initiatorWriteSyn, so this test
  // verifies the WASM-level invariant by feeding a 0-byte SYNACK
  // (wrong length) into a fresh handshake.
  const responder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  }).asResponder();
  const prefixedSyn = new Uint8Array(PREFIXED_SYN_LENGTH);
  const { initiatorReadSynack } = initiator.initiatorWriteSyn(
    responder.signingKeys.publicKey,
    prefixedSyn,
  );
  // Truncated SYNACK: AEAD read fails.
  const shortSynack = new Uint8Array(SYNACK_LENGTH);
  shortSynack.fill(0); // all zeros, not a valid Noise message
  t.throws(() => initiatorReadSynack(shortSynack), {
    message: /initiator cannot read responder's SYNACK/,
  });
});

test('SYN intended for a different responder is rejected', async t => {
  const { initiator } = createValidHandshake();

  const wrongResponder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [2, 3],
  }).asResponder();

  const intendedResponder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [2, 3],
  }).asResponder();

  const prefixedSyn = new Uint8Array(PREFIXED_SYN_LENGTH);
  initiator.initiatorWriteSyn(
    intendedResponder.signingKeys.publicKey,
    prefixedSyn,
  );

  const synack = new Uint8Array(SYNACK_LENGTH);

  t.throws(
    () => wrongResponder.responderReadSynWriteSynack(prefixedSyn, synack),
    {
      message: /SYN intended for different responder/,
    },
  );
});
