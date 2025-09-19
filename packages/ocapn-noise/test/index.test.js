import test from '@endo/ses-ava/prepare-endo.js';

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { getRandomValues } from 'crypto';
import { makeOcapnSessionCryptography } from '../src/bindings.js';

const path = fileURLToPath(new URL('../gen/ocapn-noise.wasm', import.meta.url));
const bytes = /** @type {Uint8Array<ArrayBuffer>} */ (readFileSync(path));

const wasmModule = new WebAssembly.Module(bytes);

test('ocapn session cryptography happy path', async t => {
  const initiator = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  });
  const responder = makeOcapnSessionCryptography({
    wasmModule,
    getRandomValues,
  });

  const initiatorKeys = initiator.randomKeys();
  const responderKeys = responder.randomKeys();

  // 3-way handshake
  const message1 = initiator.syn(
    initiatorKeys.privateKey,
    responderKeys.publicKey,
  );
  const { message: message2, publicKey: initiatorPublicKey } = responder.synack(
    responderKeys.privateKey,
    message1,
  );
  initiator.ack(message2);

  // the responder obtains the initiator's public key
  // this is where we would cross hellos
  t.deepEqual(initiatorKeys.publicKey, initiatorPublicKey);

  // from initiator to responder
  {
    const expected = 'hello, world!';
    const cipherBytes = initiator.encrypt(new TextEncoder().encode(expected));
    const actual = new TextDecoder().decode(responder.decrypt(cipherBytes));
    t.is(actual, expected);
  }

  // from responder to initiator
  {
    const expected = 'farewell, world!';
    const cipherBytes = responder.encrypt(new TextEncoder().encode(expected));
    const actual = new TextDecoder().decode(initiator.decrypt(cipherBytes));
    t.is(actual, expected);
  }
});
