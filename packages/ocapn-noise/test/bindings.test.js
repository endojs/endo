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

  const syn = new Uint8Array(SYN_LENGTH);
  const { initiatorReadSynackWriteAck } = initiatorWriteSyn(syn);

  const synack = new Uint8Array(SYNACK_LENGTH);
  const {
    initiatorVerifyingKey: responderInitiatorVerifyingKey,
    responderReadAck,
  } = responderReadSynWriteSynack(syn, synack);
  t.deepEqual(initiatorSigningKeys.publicKey, responderInitiatorVerifyingKey);

  const ack = new Uint8Array(ACK_LENGTH);
  const {
    encoding: initiatorNegotiatedEncoding,
    encrypt: initiatorEncrypt,
    decrypt: initiatorDecrypt,
  } = initiatorReadSynackWriteAck(synack, ack);

  const {
    encoding: responderNegotiatedEncoding,
    encrypt: responderEncrypt,
    decrypt: responderDecrypt,
  } = responderReadAck(ack);

  t.is(initiatorNegotiatedEncoding, 2);
  t.is(responderNegotiatedEncoding, 2);

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
