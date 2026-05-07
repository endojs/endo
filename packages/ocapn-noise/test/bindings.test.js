import test from '@endo/ses-ava/test.js';

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getRandomValues } from 'crypto';
import {
  makeOcapnSessionCryptography,
  PREFIXED_SYN_LENGTH,
  SYNACK_LENGTH,
  HANDSHAKE_HASH_LENGTH,
} from '../src/bindings.js';

const path = fileURLToPath(new URL('../gen/ocapn-noise.wasm', import.meta.url));
const bytes = /** @type {Uint8Array<ArrayBuffer>} */ (readFileSync(path));

const wasmModule = new WebAssembly.Module(bytes);

test('ocapn session cryptography happy path', async t => {
  const initiatorSigningKeys1 = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  }).asInitiator().signingKeys;
  const { signingKeys: initiatorSigningKeys, initiatorWriteSyn } =
    makeOcapnSessionCryptography({
      wasmModule,
      getRandomValues,
      signingKeys: initiatorSigningKeys1,
      supportedEncodings: [1, 2],
    }).asInitiator();
  t.deepEqual(initiatorSigningKeys1, initiatorSigningKeys);

  const responderSigningKeys1 = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  }).asResponder().signingKeys;
  const { signingKeys: responderSigningKeys, responderReadSynWriteSynack } =
    makeOcapnSessionCryptography({
      wasmModule,
      getRandomValues,
      signingKeys: responderSigningKeys1,
      supportedEncodings: [2, 3],
    }).asResponder();
  t.deepEqual(responderSigningKeys1, responderSigningKeys);

  // Initiator creates prefixed SYN addressed to the responder.
  const prefixedSyn = new Uint8Array(PREFIXED_SYN_LENGTH);
  const { initiatorReadSynack } = initiatorWriteSyn(
    responderSigningKeys.publicKey,
    prefixedSyn,
  );

  // Responder reads SYN and writes SYNACK; the IK handshake is
  // complete after this single bindings call (no message 3).
  const synack = new Uint8Array(SYNACK_LENGTH);
  const {
    initiatorVerifyingKey: responderInitiatorVerifyingKey,
    encoding: responderNegotiatedEncoding,
    encrypt: responderEncrypt,
    decrypt: responderDecrypt,
    handshakeHash: responderHandshakeHash,
  } = responderReadSynWriteSynack(prefixedSyn, synack);
  t.deepEqual(initiatorSigningKeys.publicKey, responderInitiatorVerifyingKey);

  // Initiator reads SYNACK to finalize.
  const {
    encoding: initiatorNegotiatedEncoding,
    encrypt: initiatorEncrypt,
    decrypt: initiatorDecrypt,
    handshakeHash: initiatorHandshakeHash,
  } = initiatorReadSynack(synack);

  t.is(initiatorNegotiatedEncoding, 2);
  t.is(responderNegotiatedEncoding, 2);

  // Both sides observe the same channel-binding hash.
  t.is(initiatorHandshakeHash.length, HANDSHAKE_HASH_LENGTH);
  t.is(responderHandshakeHash.length, HANDSHAKE_HASH_LENGTH);
  t.deepEqual(initiatorHandshakeHash, responderHandshakeHash);

  // IK identity hiding: the cleartext SYN beyond byte 32 (initiator's
  // ephemeral) does NOT contain the initiator's static Ed25519
  // verifying key.  Under XX it would have been at prefixedSyn[64..96];
  // under IK that 32-byte slot is encrypted ciphertext.
  const cleartextStaticSlot = prefixedSyn.subarray(64, 96);
  t.notDeepEqual(
    Array.from(cleartextStaticSlot),
    Array.from(initiatorSigningKeys.publicKey),
    'initiator static must be encrypted in IK msg 1',
  );

  // from initiator to responder
  {
    const expected = 'hello, world!';
    const cipherBytes = initiatorEncrypt(new TextEncoder().encode(expected));
    const actual = new TextDecoder().decode(responderDecrypt(cipherBytes));
    t.is(actual, expected);
  }

  // from responder to initiator
  {
    const expected = 'farewell, world!';
    const cipherBytes = responderEncrypt(new TextEncoder().encode(expected));
    const actual = new TextDecoder().decode(initiatorDecrypt(cipherBytes));
    t.is(actual, expected);
  }

  t.pass();
});
