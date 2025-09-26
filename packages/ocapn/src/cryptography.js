// @ts-check
import { randomBytes } from 'node:crypto';

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

import { makeSyrupWriter } from './syrup/encode.js';
import { OcapnPublicKeyCodec } from './codecs/components.js';
import { compareByteArrays } from './syrup/compare.js';

/**
 * @import { OcapnPublicKeyData, OcapnSignature } from './codecs/components.js'
 */

const textEncoder = new TextEncoder();

/**
 * @typedef {object} OcapnPublicKey
 * @property {Uint8Array} bytes
 * @property {(msg: Uint8Array, sig: OcapnSignature) => boolean} verify
 */

/**
 * @typedef {object} OcapnKeyPair
 * @property {OcapnPublicKey} publicKey
 * @property {(msg: Uint8Array) => OcapnSignature} sign
 */

/**
 * @param {OcapnSignature} sig
 * @returns {Uint8Array}
 */
export const ocapNSignatureToBytes = sig => {
  const result = new Uint8Array(sig.r.length + sig.s.length);
  result.set(sig.r, 0);
  result.set(sig.s, sig.r.length);
  return result;
};

/**
 * @param {Uint8Array} publicKey
 * @returns {OcapnPublicKey}
 */
export const makeOcapnPublicKey = publicKey => {
  return {
    bytes: publicKey,
    /**
     * @param {Uint8Array} msgBytes
     * @param {OcapnSignature} ocapnSig
     * @returns {boolean}
     */
    verify: (msgBytes, ocapnSig) => {
      const sigBytes = ocapNSignatureToBytes(ocapnSig);
      return ed25519.verify(sigBytes, msgBytes, publicKey);
    },
  };
};

/**
 * @returns {OcapnKeyPair}
 */
export const makeOcapnKeyPair = () => {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey: makeOcapnPublicKey(publicKey),
    sign: msg => {
      const sigBytes = ed25519.sign(msg, privateKey);
      return {
        type: 'sig-val',
        scheme: 'eddsa',
        r: sigBytes.slice(0, 32),
        s: sigBytes.slice(32),
      };
    },
  };
};

/**
 * @param {OcapnPublicKey} publicKey
 * @returns {OcapnPublicKeyData}
 */
export const publicKeyToPublicKeyData = publicKey => {
  return {
    type: 'public-key',
    scheme: 'ecc',
    curve: 'Ed25519',
    flags: 'eddsa',
    q: publicKey.bytes,
  };
};

/**
 * @param {OcapnPublicKeyData} publicKeyData
 * @returns {OcapnPublicKey}
 */
export const publicKeyDataToPublicKey = publicKeyData => {
  return makeOcapnPublicKey(publicKeyData.q);
};

/**
 * @param {OcapnPublicKeyData} publicKeyData
 * @returns {Uint8Array}
 */
const publicKeyDataToEncodedBytes = publicKeyData => {
  const syrupWriter = makeSyrupWriter();
  OcapnPublicKeyCodec.write(publicKeyData, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {OcapnPublicKey} publicKey
 * @returns {Uint8Array}
 */
export const makePublicKeyId = publicKey => {
  const publicKeyData = publicKeyToPublicKeyData(publicKey);
  const publicKeyEncoded = publicKeyDataToEncodedBytes(publicKeyData);
  // Double SHA256 hash of the public key
  return sha256(sha256(publicKeyEncoded));
};

/**
 * @param {Uint8Array} peerIdOne
 * @param {Uint8Array} peerIdTwo
 * @returns {Uint8Array}
 */
export const makeSessionId = (peerIdOne, peerIdTwo) => {
  // Calculate the ID of each side using the process described above.
  // Sort both IDs based on the resulting octets
  const result = compareByteArrays(
    peerIdOne,
    peerIdTwo,
    0,
    peerIdOne.length,
    0,
    peerIdTwo.length,
  );
  const peerIds = result < 0 ? [peerIdOne, peerIdTwo] : [peerIdTwo, peerIdOne];
  // Concatinating them in the order from number 3
  // Append the string "prot0" to the beginning
  const inputBytes = new Uint8Array([
    ...textEncoder.encode('prot0'),
    ...peerIds[0],
    ...peerIds[1],
  ]);
  // Double SHA256 hash the resulting string
  return sha256(sha256(inputBytes));
};

/**
 * @returns {Uint8Array}
 */
export const randomGiftId = () => {
  return randomBytes(16);
};
