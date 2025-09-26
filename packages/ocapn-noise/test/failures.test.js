import test from '@endo/ses-ava/prepare-endo.js';

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getRandomValues } from 'crypto';
import {
  makeOcapnSessionCryptography,
  SYN_LENGTH,
  SYNACK_LENGTH,
  ACK_LENGTH,
} from '../src/bindings.js';

const path = fileURLToPath(new URL('../gen/ocapn-noise.wasm', import.meta.url));
const bytes = /** @type {Uint8Array<ArrayBuffer>} */ (readFileSync(path));

const wasmModule = new WebAssembly.Module(bytes);

// Helper function to create a valid handshake setup
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

test('handshake fails with invalid SYNACK message', async t => {
  const { initiator, responder } = createValidHandshake();

  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  responder.responderReadSynWriteSynack(syn, synack);

  // Corrupt the SYNACK message
  synack[0] = 0xff; // Corrupt first byte
  synack[1] = 0xff; // Corrupt second byte

  const ack = new Uint8Array(ACK_LENGTH);

  t.throws(() => _initiatorReadSynackWriteAck(synack, ack), {
    message:
      "OCapN Noise Protocol initiator cannot read responder's ACK message",
  });
});

test('handshake fails with invalid ACK message', async t => {
  const { initiator, responder } = createValidHandshake();

  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const { responderReadAck } = responder.responderReadSynWriteSynack(
    syn,
    synack,
  );

  const ack = new Uint8Array(ACK_LENGTH);
  _initiatorReadSynackWriteAck(synack, ack);

  // Corrupt the ACK message
  ack[0] = 0xff; // Corrupt first byte
  ack[1] = 0xff; // Corrupt second byte

  t.throws(() => responderReadAck(ack), {
    message:
      "OCapN Noise Protocol responder cannot read initiator's ACK message",
  });
});

test('handshake fails with no mutually supported encodings', async t => {
  const initiator = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [1, 2], // Only supports 1, 2
  }).asInitiator();

  const responder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
    supportedEncodings: [3, 4], // Only supports 3, 4
  }).asResponder();

  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);

  t.throws(() => responder.responderReadSynWriteSynack(syn, synack), {
    message:
      'OCapN Noise Protocol no mutually supported encoding versions. Responder supports 3, 4; initiator supports 2, 1',
  });
});

test('handshake fails with message too long for encryption', async t => {
  const { initiator, responder } = createValidHandshake();

  // Complete the handshake first
  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const { responderReadAck } = responder.responderReadSynWriteSynack(
    syn,
    synack,
  );

  const ack = new Uint8Array(ACK_LENGTH);
  const { encrypt: _initiatorEncrypt } = _initiatorReadSynackWriteAck(
    synack,
    ack,
  );
  responderReadAck(ack);

  // Try to encrypt a message that's too long
  const longMessage = new Uint8Array(65535 - 15); // Just over the limit
  longMessage.fill(0x42);

  t.throws(() => _initiatorEncrypt(longMessage), {
    message:
      'OCapN Noise Protocol message exceeds maximum length for encryption',
  });
});

test('handshake fails with message too short for decryption', async t => {
  const { initiator, responder } = createValidHandshake();

  // Complete the handshake first
  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const { responderReadAck } = responder.responderReadSynWriteSynack(
    syn,
    synack,
  );

  const ack = new Uint8Array(ACK_LENGTH);
  const { encrypt: _initiatorEncrypt, decrypt: responderDecrypt } =
    _initiatorReadSynackWriteAck(synack, ack);
  responderReadAck(ack);

  // Try to decrypt a message that's too short
  const shortMessage = new Uint8Array(15); // Just under the minimum

  t.throws(() => responderDecrypt(shortMessage), {
    message: 'OCapN Noise Protocol message not long enough for decryption',
  });
});

test('handshake fails with message too long for decryption', async t => {
  const { initiator, responder } = createValidHandshake();

  // Complete the handshake first
  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const { responderReadAck } = responder.responderReadSynWriteSynack(
    syn,
    synack,
  );

  const ack = new Uint8Array(ACK_LENGTH);
  const { encrypt: _initiatorEncrypt, decrypt: responderDecrypt } =
    _initiatorReadSynackWriteAck(synack, ack);
  responderReadAck(ack);

  // Try to decrypt a message that's too long
  const longMessage = new Uint8Array(65536); // Just over the maximum

  t.throws(() => responderDecrypt(longMessage), {
    message:
      'OCapN Noise Protocol message exceeds maximum length for decryption',
  });
});

test.only('handshake fails with invalid encoding versions', async t => {
  // Test with encoding version > 65535
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [65536], // Invalid encoding version
      }).asInitiator(),
    {
      message: 'Cannot support encoding versions beyond 65535, got 65536',
    },
  );

  // Test with too many encoding versions
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
        ], // Too many versions
      }).asInitiator(),
    {
      message: 'Cannot support more than 17 encoding versions simultaneously',
    },
  );

  // Test with no encoding versions
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [], // No versions
      }).asInitiator(),
    {
      message: 'Must support at least one encoding version',
    },
  );

  // Test with encodings too far apart
  t.throws(
    () =>
      makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        supportedEncodings: [1, 18], // Too far apart (more than 16 versions)
      }).asInitiator(),
    {
      message:
        'Cannot simultaneously support encodings that are more than 16 versions apart, got 1, 18',
    },
  );
});

test('handshake fails with decryption of invalid message', async t => {
  const { initiator, responder } = createValidHandshake();

  // Complete the handshake first
  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const { responderReadAck } = responder.responderReadSynWriteSynack(
    syn,
    synack,
  );

  const ack = new Uint8Array(ACK_LENGTH);
  const { encrypt: _initiatorEncrypt, decrypt: responderDecrypt } =
    _initiatorReadSynackWriteAck(synack, ack);
  responderReadAck(ack);

  // Try to decrypt a message that's not properly encrypted
  const invalidMessage = new Uint8Array(32); // Valid length but invalid content
  invalidMessage.fill(0xff);

  t.throws(() => responderDecrypt(invalidMessage), {
    message: 'OCapN Noise Protocol decryption failed',
  });
});

test('handshake fails with wrong message order - using initiatorReadSynackWriteAck before handshake complete', async t => {
  const { initiator, responder: _responder } = createValidHandshake();

  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck: _initiatorReadSynackWriteAck } =
    initiator.initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  // Don't call responderReadSynWriteSynack yet

  const ack = new Uint8Array(ACK_LENGTH);

  // Try to use initiatorReadSynackWriteAck before responder has processed SYN
  t.throws(() => _initiatorReadSynackWriteAck(synack, ack), {
    message:
      "OCapN Noise Protocol initiator cannot read responder's ACK message",
  });
});
